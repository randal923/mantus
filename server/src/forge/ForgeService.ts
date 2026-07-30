import {
  FORGE_RULES,
  FORGE_TIER_PRICES,
  forgeMaxTierFor,
  type ForgeActionFailedReason,
  type ForgeConversionMessage,
  type ForgeFusionMessage,
  type ForgeHistoryGetMessage,
  type ForgeTransferMessage,
} from "@tibia/protocol";
import type { WorldActionRng } from "../action/WorldActionRng";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { forgeBonusFor } from "./forgeBonusFor";
import type {
  ForgeExchangeRequest,
  ForgeHistoryRow,
  ForgeResourcesRecord,
  ForgeStore,
} from "./ForgeStore";
import { LoginLoadQueue } from "../character/LoginLoadQueue";
import { itemImbuementsOf } from "./itemImbuementsOf";
import { itemTierOf } from "./itemTierOf";

/**
 * Exaltation Forge conversions (Feature 78), transcribed from pinned Canary
 * player.cpp:11036-11567 and game.cpp:11142-11217. Every roll happens here
 * with server RNG inside the tick; the store then performs the whole
 * exchange — version-guarded item writes, dust/gold/core legs, the history
 * row, and the audit row — in one SERIALIZABLE transaction, and memory
 * applies only the committed mutation (charter rules 2, 3, 11). Intents are
 * refused while any item write is in flight for the character, so the rows
 * the transaction guards are exactly the rows memory validated.
 */
export class ForgeService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly resourcesByCharacter = new Map<
    string,
    ForgeResourcesRecord
  >();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly items: ItemIntentHandler,
    private readonly catalog: ItemCatalog,
    private readonly rng: WorldActionRng,
    private readonly store?: ForgeStore,
    private readonly loginLoads: LoginLoadQueue = new LoginLoadQueue(),
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
  }

  detachCharacter(characterId: string): void {
    this.resourcesByCharacter.delete(characterId);
  }

  attachCharacter(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) {
      this.resourcesByCharacter.set(characterId, {
        dusts: 0,
        dustLevel: FORGE_RULES.initialDustLimit,
      });
      return;
    }
    const loaded = this.loginLoads.run(characterId, () =>
      store.load(characterId),
    );
    this.track(
      loaded.then(
        (resources) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            this.resourcesByCharacter.set(characterId, resources);
            this.sendState(session, characterId);
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(`forge load failed for ${characterId}: ${reason}`);
        },
      ),
    );
  }

  /** Kill-credit dust for every damager, clamped to each cap in SQL. */
  creditDusts(characterIds: ReadonlyArray<string>, stack: number): void {
    const store = this.store;
    if (!store || stack <= 0) return;
    for (const characterId of new Set(characterIds)) {
      if (!this.resourcesByCharacter.has(characterId)) continue;
      const amount = this.rng.integer(
        stack,
        FORGE_RULES.dustPerStackMultiplier * stack,
      );
      this.track(
        store.grantDusts(characterId, amount).then(
          (resources) => {
            this.outcomes.push(() => {
              const session = this.registry.sessionFor(characterId);
              if (!session) return;
              this.resourcesByCharacter.set(characterId, resources);
              this.sendState(session, characterId);
            });
          },
          (cause: unknown) => {
            const reason = cause instanceof Error ? cause.message : "unknown";
            console.warn(`forge dust grant failed for ${characterId}: ${reason}`);
          },
        ),
      );
    }
  }

  handleGet(session: Session, now: number): void {
    const characterId = session.playerId;
    if (!characterId || !this.guard(session, now)) return;
    if (!this.resourcesByCharacter.has(characterId)) return;
    this.sendState(session, characterId);
  }

  handleHistory(
    session: Session,
    intent: ForgeHistoryGetMessage,
    now: number,
  ): void {
    const characterId = session.playerId;
    const store = this.store;
    if (!characterId || !store || !this.guard(session, now)) return;
    this.track(
      store.history(characterId, intent.page, FORGE_RULES.historyPageSize).then(
        (page) => {
          this.outcomes.push(() => {
            const active = this.registry.sessionFor(characterId);
            if (active !== session) return;
            session.send({
              type: "forge-history-state",
              page: intent.page,
              totalPages: Math.ceil(
                page.totalEntries / FORGE_RULES.historyPageSize,
              ),
              entries: page.entries.map((entry) => ({
                at: entry.createdAt,
                action: entry.action,
                convergence: entry.convergence,
                success: entry.success,
                bonus: entry.bonus,
                tier: entry.tier,
                description: entry.description,
                costGold: entry.costGold,
                costDust: entry.costDust,
                costCores: entry.costCores,
                gained: entry.gained,
              })),
            });
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(`forge history failed for ${characterId}: ${reason}`);
        },
      ),
    );
  }

  handleFusion(session: Session, intent: ForgeFusionMessage, now: number): void {
    const context = this.beginExchange(session, now);
    if (!context) return;
    const { characterId, byId } = context;
    const first = byId.get(intent.firstItemId);
    const second = byId.get(intent.secondItemId);
    if (!first || !second || first.id === second.id) {
      return this.fail(session, "invalid-item");
    }
    if (first.typeId !== second.typeId) {
      return this.fail(session, "invalid-item");
    }
    if (itemImbuementsOf(first).length > 0 || itemImbuementsOf(second).length > 0) {
      return this.fail(session, "item-imbued");
    }
    const type = this.catalog.get(first.typeId);
    const classification = type?.classification ?? 0;
    if (!type || classification <= 0) return this.fail(session, "invalid-item");
    const tier = itemTierOf(first);
    if (itemTierOf(second) !== tier) return this.fail(session, "invalid-item");
    const targetTier = tier + 1;
    if (targetTier > forgeMaxTierFor(classification)) {
      return this.fail(session, "tier-limit");
    }
    if (intent.convergence && classification !== 4) {
      return this.fail(session, "not-convergible");
    }
    const prices = FORGE_TIER_PRICES[classification]?.[targetTier];
    if (!prices) return this.fail(session, "tier-limit");

    // All rolls happen here, server-side, before the transaction
    // (game.cpp:11156-11172); convergence never rolls.
    const success =
      intent.convergence ||
      this.rng.integer(1, 100) <=
        FORGE_RULES.baseSuccessPercent +
          (intent.usedCore ? FORGE_RULES.coreSuccessPercent : 0);
    let bonus = intent.convergence ? 0 : forgeBonusFor(this.rng.integer(0, 10_000));
    const coreCount = intent.convergence
      ? 0
      : (intent.usedCore ? 1 : 0) + (intent.reduceTierLoss ? 1 : 0);
    const dustCost = intent.convergence
      ? FORGE_RULES.convergenceFusionDustCost
      : FORGE_RULES.fusionDustCost;
    const goldCost = intent.convergence
      ? prices.convergenceFusionPrice
      : prices.regularPrice;

    const changes: Array<ForgeExchangeRequest["changes"][number]> = [];
    const destroyItems: Array<{ itemId: string; expectedVersion: number }> = [];
    let effectiveDustCost: number = dustCost;
    let effectiveCoreCost: number = coreCount;
    let effectiveGoldCost: number = goldCost;
    let resultTier = targetTier;
    if (intent.convergence) {
      changes.push({
        itemId: first.id,
        expectedVersion: first.version,
        newTier: targetTier,
      });
      destroyItems.push({ itemId: second.id, expectedVersion: second.version });
    } else if (success) {
      // Bonus skips (player.cpp:11209-11265): 1 = dust kept, 2 = cores
      // kept, 3 = gold kept; 4/5/6 keep the second item; 7 = two tiers.
      if (bonus === 1) effectiveDustCost = 0;
      if (bonus === 2) effectiveCoreCost = 0;
      if (bonus === 3) effectiveGoldCost = 0;
      if (bonus === 7 && tier + 2 <= classification) {
        resultTier = tier + 2;
      }
      changes.push({
        itemId: first.id,
        expectedVersion: first.version,
        newTier: resultTier,
      });
      if (bonus === 4) {
        if (tier > 0) {
          changes.push({
            itemId: second.id,
            expectedVersion: second.version,
            newTier: tier - 1,
          });
        }
      } else if (bonus === 6) {
        changes.push({
          itemId: second.id,
          expectedVersion: second.version,
          newTier: tier + 1,
        });
      } else if (bonus !== 5) {
        destroyItems.push({
          itemId: second.id,
          expectedVersion: second.version,
        });
      }
    } else {
      // Failure (player.cpp:11266-11319): the first item is untouched; the
      // second loses a tier (or is destroyed at 0) unless the loss roll
      // saved it. Dust, cores, and gold are all still consumed.
      resultTier = tier;
      const tierLost =
        this.rng.integer(1, 100) <=
        (intent.reduceTierLoss ? FORGE_RULES.tierLossReductionPercent : 100);
      if (tierLost) {
        if (tier >= 1) {
          changes.push({
            itemId: second.id,
            expectedVersion: second.version,
            newTier: tier - 1,
          });
        } else {
          destroyItems.push({
            itemId: second.id,
            expectedVersion: second.version,
          });
        }
        bonus = 0;
      } else {
        bonus = 8;
      }
    }
    if (!this.checkBalances(session, characterId, {
      dustCost: effectiveDustCost,
      coreCost: effectiveCoreCost,
    })) {
      return;
    }
    const history: ForgeHistoryRow = {
      action: "fusion",
      convergence: intent.convergence,
      success: intent.convergence ? true : success,
      bonus,
      tier: resultTier,
      description: `${type.name} (tier ${tier} -> ${success || intent.convergence ? resultTier : tier})`,
      costGold: effectiveGoldCost,
      costDust: effectiveDustCost,
      costCores: effectiveCoreCost,
      gained: 0,
    };
    this.runExchange(session, characterId, {
      action: "fusion",
      changes,
      destroyItems,
      coreCost: effectiveCoreCost,
      dustCost: effectiveDustCost,
      goldCost: effectiveGoldCost,
      history,
    }, {
      action: "fusion",
      convergence: intent.convergence,
      success: intent.convergence ? true : success,
      bonus,
      itemTypeId: first.typeId,
      resultTier,
    });
  }

  handleTransfer(
    session: Session,
    intent: ForgeTransferMessage,
    now: number,
  ): void {
    const context = this.beginExchange(session, now);
    if (!context) return;
    const { characterId, byId } = context;
    const donor = byId.get(intent.donorItemId);
    const receiver = byId.get(intent.receiverItemId);
    if (!donor || !receiver || donor.id === receiver.id) {
      return this.fail(session, "invalid-item");
    }
    if (itemImbuementsOf(donor).length > 0 || itemImbuementsOf(receiver).length > 0) {
      return this.fail(session, "item-imbued");
    }
    const donorType = this.catalog.get(donor.typeId);
    const receiverType = this.catalog.get(receiver.typeId);
    const classification = donorType?.classification ?? 0;
    if (!donorType || !receiverType || classification <= 0) {
      return this.fail(session, "invalid-item");
    }
    if (receiverType.classification !== classification) {
      return this.fail(session, "invalid-item");
    }
    // Same equipment slot family, with two-handed normalized to hand
    // (protocolgame.cpp:7193-7228).
    if (
      (donorType.equipmentSlot ?? donorType.weaponType) !==
      (receiverType.equipmentSlot ?? receiverType.weaponType)
    ) {
      return this.fail(session, "invalid-item");
    }
    const tier = itemTierOf(donor);
    if (tier < 2 || itemTierOf(receiver) !== 0) {
      return this.fail(session, "invalid-item");
    }
    if (intent.convergence && classification !== 4) {
      return this.fail(session, "not-convergible");
    }
    const resultTier = intent.convergence ? tier : tier - 1;
    const prices = FORGE_TIER_PRICES[classification]?.[resultTier];
    if (!prices) return this.fail(session, "tier-limit");
    const dustCost = intent.convergence
      ? FORGE_RULES.convergenceTransferDustCost
      : FORGE_RULES.transferDustCost;
    const goldCost = intent.convergence
      ? prices.convergenceTransferPrice
      : prices.regularPrice;
    const coreCost = prices.corePrice;
    if (!this.checkBalances(session, characterId, { dustCost, coreCost })) {
      return;
    }
    const history: ForgeHistoryRow = {
      action: "transfer",
      convergence: intent.convergence,
      success: true,
      bonus: 0,
      tier: resultTier,
      description: `${donorType.name} -> ${receiverType.name} (tier ${resultTier})`,
      costGold: goldCost,
      costDust: dustCost,
      costCores: coreCost,
      gained: 0,
    };
    this.runExchange(session, characterId, {
      action: "transfer",
      changes: [
        {
          itemId: receiver.id,
          expectedVersion: receiver.version,
          newTier: resultTier,
        },
      ],
      destroyItems: [{ itemId: donor.id, expectedVersion: donor.version }],
      coreCost,
      dustCost,
      goldCost,
      history,
    }, {
      action: "transfer",
      convergence: intent.convergence,
      success: true,
      bonus: 0,
      itemTypeId: receiver.typeId,
      resultTier,
    });
  }

  handleConversion(
    session: Session,
    intent: ForgeConversionMessage,
    now: number,
  ): void {
    const characterId = session.playerId;
    const store = this.store;
    if (!characterId || !this.guard(session, now)) return;
    if (!store || !this.world.getPlayer(characterId)) return;
    if (session.itemOperationPending || session.itemPersistsPending > 0) {
      return this.fail(session, "rate-limited");
    }
    const resources = this.resourcesByCharacter.get(characterId);
    if (!resources) return;
    let history: ForgeHistoryRow;
    if (intent.conversion === "dust-to-slivers") {
      const cost = FORGE_RULES.dustPerSliver * FORGE_RULES.sliversPerConversion;
      if (resources.dusts < cost) {
        return this.fail(session, "insufficient-dust");
      }
      history = {
        action: "dust-to-slivers",
        convergence: false,
        success: true,
        bonus: 0,
        tier: 0,
        description: `${cost} dust -> ${FORGE_RULES.sliversPerConversion} slivers`,
        costGold: 0,
        costDust: cost,
        costCores: 0,
        gained: FORGE_RULES.sliversPerConversion,
      };
    } else if (intent.conversion === "slivers-to-cores") {
      const snapshot = this.items.inventorySnapshot(characterId);
      const slivers = snapshot?.items.reduce(
        (total, item) =>
          item.typeId === FORGE_RULES.sliverItemTypeId
            ? total + item.count
            : total,
        0,
      );
      if ((slivers ?? 0) < FORGE_RULES.sliverCoreCost) {
        return this.fail(session, "insufficient-slivers");
      }
      history = {
        action: "slivers-to-cores",
        convergence: false,
        success: true,
        bonus: 0,
        tier: 0,
        description: `${FORGE_RULES.sliverCoreCost} slivers -> 1 exalted core`,
        costGold: 0,
        costDust: 0,
        costCores: 0,
        gained: 1,
      };
    } else {
      if (resources.dustLevel >= FORGE_RULES.maxDustLimit) {
        return this.fail(session, "dust-limit-reached");
      }
      const cost = resources.dustLevel - FORGE_RULES.dustLimitCostOffset;
      if (resources.dusts < cost) {
        return this.fail(session, "insufficient-dust");
      }
      history = {
        action: "increase-dust-limit",
        convergence: false,
        success: true,
        bonus: 0,
        tier: 0,
        description: `dust limit ${resources.dustLevel} -> ${resources.dustLevel + 1}`,
        costGold: 0,
        costDust: cost,
        costCores: 0,
        gained: resources.dustLevel + 1,
      };
    }
    session.itemOperationPending = true;
    const resolution = store
      .conversion(characterId, { conversion: intent.conversion, history })
      .then(
        (result) => {
          this.outcomes.push((at) => {
            session.itemOperationPending = false;
            if (result.status !== "committed") {
              if (session.playerId === characterId) {
                this.fail(session, this.reasonOf(result.status));
              }
              return;
            }
            this.items.applyCommittedMutation(
              session,
              characterId,
              result.mutation,
              at,
            );
            this.resourcesByCharacter.set(characterId, result.resources);
            if (session.playerId === characterId) {
              this.sendState(session, characterId);
            }
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(`forge conversion failed for ${characterId}: ${reason}`);
          this.outcomes.push(() => {
            session.itemOperationPending = false;
            if (session.playerId === characterId) {
              this.fail(session, "invalid-request");
            }
          });
        },
      );
    this.track(resolution);
    this.items.trackExternalOperation(characterId, resolution);
  }

  private beginExchange(
    session: Session,
    now: number,
  ): { characterId: string; byId: Map<string, Item> } | null {
    const characterId = session.playerId;
    if (!characterId || !this.guard(session, now)) return null;
    if (!this.store || !this.world.getPlayer(characterId)) return null;
    if (session.itemOperationPending || session.itemPersistsPending > 0) {
      this.fail(session, "rate-limited");
      return null;
    }
    const snapshot = this.items.inventorySnapshot(characterId);
    if (!snapshot) return null;
    return {
      characterId,
      byId: new Map(snapshot.items.map((item) => [item.id, item])),
    };
  }

  private checkBalances(
    session: Session,
    characterId: string,
    costs: { dustCost: number; coreCost: number },
  ): boolean {
    const resources = this.resourcesByCharacter.get(characterId);
    if (!resources || resources.dusts < costs.dustCost) {
      this.fail(session, "insufficient-dust");
      return false;
    }
    if (costs.coreCost > 0) {
      const snapshot = this.items.inventorySnapshot(characterId);
      const cores = snapshot?.items.reduce(
        (total, item) =>
          item.typeId === FORGE_RULES.coreItemTypeId
            ? total + item.count
            : total,
        0,
      );
      if ((cores ?? 0) < costs.coreCost) {
        this.fail(session, "insufficient-cores");
        return false;
      }
    }
    return true;
  }

  private runExchange(
    session: Session,
    characterId: string,
    request: ForgeExchangeRequest,
    result: {
      action: "fusion" | "transfer";
      convergence: boolean;
      success: boolean;
      bonus: number;
      itemTypeId: number;
      resultTier: number;
    },
  ): void {
    const store = this.store;
    if (!store) return;
    session.itemOperationPending = true;
    const resolution = store.exchange(characterId, request).then(
      (outcome) => {
        this.outcomes.push((at) => {
          session.itemOperationPending = false;
          if (outcome.status !== "committed") {
            if (session.playerId === characterId) {
              this.fail(session, this.reasonOf(outcome.status));
            }
            return;
          }
          this.items.applyCommittedMutation(
            session,
            characterId,
            outcome.mutation,
            at,
          );
          this.resourcesByCharacter.set(characterId, outcome.resources);
          if (session.playerId === characterId) {
            session.send({
              type: "forge-result",
              action: result.action,
              convergence: result.convergence,
              success: result.success,
              bonus: result.bonus,
              itemTypeId: result.itemTypeId,
              resultTier: result.resultTier,
            });
            this.sendState(session, characterId);
          }
        });
      },
      (cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`forge ${request.action} failed for ${characterId}: ${reason}`);
        this.outcomes.push(() => {
          session.itemOperationPending = false;
          if (session.playerId === characterId) {
            this.fail(session, "invalid-request");
          }
        });
      },
    );
    this.track(resolution);
    this.items.trackExternalOperation(characterId, resolution);
  }

  private sendState(session: Session, characterId: string): void {
    const resources = this.resourcesByCharacter.get(characterId);
    if (!resources) return;
    const snapshot = this.items.inventorySnapshot(characterId);
    const count = (typeId: number) =>
      snapshot?.items.reduce(
        (total, item) => (item.typeId === typeId ? total + item.count : total),
        0,
      ) ?? 0;
    session.send({
      type: "forge-state",
      dusts: Math.min(resources.dusts, resources.dustLevel),
      dustLimit: resources.dustLevel,
      slivers: count(FORGE_RULES.sliverItemTypeId),
      cores: count(FORGE_RULES.coreItemTypeId),
    });
  }

  private reasonOf(
    status:
      | "insufficient-dust"
      | "insufficient-gold"
      | "insufficient-cores"
      | "insufficient-slivers"
      | "dust-limit-reached"
      | "backpack-full"
      | "conflict",
  ): ForgeActionFailedReason {
    return status === "conflict" ? "invalid-request" : status;
  }

  private guard(session: Session, now: number): boolean {
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) return false;
    this.cooldownBySession.set(session.id, now + FORGE_RULES.actionCooldownMs);
    return true;
  }

  private fail(session: Session, reason: ForgeActionFailedReason): void {
    session.send({ type: "forge-action-failed", reason });
  }

  private track(operation: Promise<unknown>): void {
    const tracked = operation.then(
      () => undefined,
      () => undefined,
    );
    this.pendingOperations.add(tracked);
    void tracked.finally(() => this.pendingOperations.delete(tracked));
  }
}
