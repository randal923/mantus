import {
  BOOSTED_RULES,
  REWARD_LIMITS,
  type Position,
  type RewardActionFailedReason,
  type RewardCollectMessage,
} from "@tibia/protocol";
import { CombatFormula } from "../combat/CombatFormula";
import { resolveMonsterLootType } from "../combat/resolveMonsterLootType";
import { Monster } from "../creature/Monster";
import { carriedWeight } from "../depot/carriedWeight";
import { isNear } from "../item/isNear";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { bossRewardRollCount } from "./bossRewardRollCount";
import { RewardBossTracker } from "./RewardBossTracker";
import type { RewardHooks } from "./RewardHooks";
import { rollBossRewardLoot, type BossRewardRoll } from "./rollBossRewardLoot";
import type { RewardChestSnapshot, RewardStore } from "./RewardStore";

/** Canary ITEM_REWARD_CHEST (utils_definitions.hpp:610). */
const REWARD_CHEST_ITEM_ID = 19_250;

export interface RewardBossBonusHooks {
  /** The slotted boss's loot bonus, or null when the boss isn't slotted. */
  slotLootBonusPercent(characterId: string, raceId: number): number | null;
  boostedBossRaceId(): number | null;
  raceIdOf(monster: Monster): number | undefined;
}

/**
 * Boss reward chests (Feature 84). Kill contributions are tracked in-tick,
 * loot is rolled with the server RNG at death (Canary reward_chest.lua score
 * split, crowd penalty, slot/boosted bonus rolls), and grants are
 * exactly-once per (death event, recipient) via the store's claim. Opening
 * the map chest projects only the session's own bags; collects follow the
 * chest pattern: one DB transaction, then the committed mutation applies to
 * the live inventory inside the tick (charter rules 1, 2, 4).
 */
export class RewardChestService implements RewardHooks {
  private readonly tracker = new RewardBossTracker();
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly stateByCharacter = new Map<string, RewardChestSnapshot>();
  private readonly accessBySession = new WeakMap<Session, Position>();
  private readonly lastCollectBySession = new WeakMap<Session, number>();
  private readonly loadsInFlight = new Set<string>();
  private readonly formula: CombatFormula;

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly items: ItemIntentHandler,
    private readonly catalog: ItemCatalog,
    private readonly bonuses: RewardBossBonusHooks,
    seed: number,
    private readonly lootRate = 1,
    private readonly store?: RewardStore,
  ) {
    this.formula = new CombatFormula(seed ^ 0x52e3_7a1d);
  }

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detachCharacter(characterId: string): void {
    this.stateByCharacter.delete(characterId);
  }

  onBossDamageTaken(monster: Monster, playerId: string, amount: number): void {
    this.tracker.onBossDamageTaken(monster, playerId, amount);
  }

  onPlayerHealed(healerId: string, targetId: string, amount: number): void {
    this.tracker.onPlayerHealed(healerId, targetId, amount, (monsterId) => {
      const creature = this.world.getCreature(monsterId);
      return creature instanceof Monster ? creature : undefined;
    });
  }

  /** Rolls and grants every participant's bag; runs inside the death tick. */
  onRewardBossDeath(monster: Monster, deathEventId: string, now: number): void {
    const shares = this.tracker.sharesFor(monster);
    const store = this.store;
    if (!store || shares.length === 0) return;
    const raceId = this.bonuses.raceIdOf(monster);
    const boostedRaceId = this.bonuses.boostedBossRaceId();
    const roll: BossRewardRoll = {
      resolve: (entry) =>
        resolveMonsterLootType(entry, {
          byId: (id) => this.catalog.get(id),
          byName: (name) => this.catalog.findByName(name),
        }),
      chance: (percent) => this.formula.chance(percent),
      integer: (minimum, maximum) => this.formula.integer(minimum, maximum),
    };
    for (const share of shares) {
      // Canary reward_chest.lua:88-96: a slotted boss pays the slot bonus;
      // otherwise the boosted boss pays the flat boosted bonus.
      const slotBonus =
        raceId === undefined
          ? null
          : this.bonuses.slotLootBonusPercent(share.characterId, raceId);
      const boosted = raceId !== undefined && raceId === boostedRaceId;
      const bonusPercent =
        slotBonus ?? (boosted ? BOOSTED_RULES.bossLootBonusPercent : 0);
      const rolls = bossRewardRollCount(bonusPercent, (percent) =>
        this.formula.chance(percent),
      );
      const loot = rollBossRewardLoot({
        entries: monster.type.loot,
        lootFactor: share.lootFactor,
        lootRate: this.lootRate,
        topScore: share.topScore,
        equipmentOnly: false,
        capacity: REWARD_LIMITS.maxItemsPerBag,
        roll,
      });
      for (let extra = 2; extra <= rolls; extra++) {
        loot.push(
          ...rollBossRewardLoot({
            entries: monster.type.loot,
            lootFactor: share.lootFactor,
            lootRate: this.lootRate,
            topScore: false,
            equipmentOnly: true,
            capacity: REWARD_LIMITS.maxItemsPerBag - loot.length,
            roll,
          }),
        );
      }
      this.grant(monster, deathEventId, share.characterId, loot, now);
    }
  }

  /** True when this use hit a reward chest (handled, even on failure). */
  handleMapUse(session: Session, position: Position, now: number): boolean {
    const chest = this.world
      .getMapItems(position)
      .some((item) => item.itemId === REWARD_CHEST_ITEM_ID);
    if (!chest) return false;
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!player || !playerId) return true;
    if (!isNear(player.position, position)) {
      this.fail(session, "out-of-reach");
      return true;
    }
    const store = this.store;
    if (!store || this.loadsInFlight.has(playerId)) {
      this.fail(session, "busy");
      return true;
    }
    this.loadsInFlight.add(playerId);
    const resolution = store.loadRewardChest(playerId, now).then(
      (state) => {
        this.outcomes.push(() => {
          this.loadsInFlight.delete(playerId);
          if (session.playerId !== playerId) return;
          this.stateByCharacter.set(playerId, state);
          this.accessBySession.set(session, position);
          session.send({ type: "reward-chest-state", bags: [...state.bags] });
        });
      },
      (cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`reward chest load failed for ${playerId}: ${reason}`);
        this.outcomes.push(() => {
          this.loadsInFlight.delete(playerId);
          if (session.playerId !== playerId) return;
          this.fail(session, "busy");
        });
      },
    );
    this.track(resolution);
    return true;
  }

  handleCollect(
    session: Session,
    intent: RewardCollectMessage,
    now: number,
  ): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    const store = this.store;
    if (!player || !playerId || !store) {
      this.fail(session, "invalid-request");
      return;
    }
    const lastCollect = this.lastCollectBySession.get(session) ?? 0;
    if (now - lastCollect < REWARD_LIMITS.collectCooldownMs) {
      this.fail(session, "rate-limited");
      return;
    }
    this.lastCollectBySession.set(session, now);
    if (session.itemOperationPending || session.itemPersistsPending > 0) {
      this.fail(session, "busy");
      return;
    }
    const opened = this.accessBySession.get(session);
    if (!opened || !isNear(player.position, opened)) {
      this.fail(session, "out-of-reach");
      return;
    }
    const bag = this.stateByCharacter
      .get(playerId)
      ?.bags.find((entry) => entry.bagId === intent.bagId);
    const targets = bag
      ? intent.itemId
        ? bag.items.filter((item) => item.itemId === intent.itemId)
        : bag.items
      : [];
    if (!bag || targets.length === 0) {
      this.fail(session, "not-found");
      return;
    }
    if (!this.hasRoomFor(playerId, targets)) {
      this.fail(session, "too-heavy");
      return;
    }
    session.itemOperationPending = true;
    const resolution = store
      .collect(playerId, intent.bagId, intent.itemId ?? null, now)
      .then(
        (result) => {
          this.outcomes.push((at) => {
            if (result.status === "committed") {
              this.items.applyCommittedMutation(
                session,
                playerId,
                result.mutation,
                at,
              );
            }
            if (session.playerId !== playerId) return;
            session.itemOperationPending = false;
            if (result.status === "committed") {
              this.stateByCharacter.set(playerId, result.state);
              session.send({
                type: "reward-chest-state",
                bags: [...result.state.bags],
              });
              return;
            }
            this.fail(
              session,
              result.status === "no-space" ? "no-space" : "not-found",
            );
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(`reward collect failed for ${playerId}: ${reason}`);
          this.outcomes.push(() => {
            if (session.playerId !== playerId) return;
            session.itemOperationPending = false;
            this.fail(session, "invalid-request");
          });
        },
      );
    this.track(resolution);
    this.items.trackExternalOperation(playerId, resolution);
  }

  private grant(
    monster: Monster,
    deathEventId: string,
    characterId: string,
    loot: ReadonlyArray<{ typeId: number; count: number }>,
    now: number,
  ): void {
    const store = this.store;
    if (!store) return;
    const resolution = store
      .grantBossRewards({
        grantKey: `boss-reward:${deathEventId}:${characterId}`,
        recipientCharacterId: characterId,
        bossName: monster.name,
        createdAtMs: now,
        items: loot,
      })
      .then(
        (result) => {
          if (result.status !== "granted" || result.bagItemId === null) return;
          this.outcomes.push(() => {
            // The chest is DB-authoritative: drop any cached view so the
            // next open reloads, and tell a live owner about the drop.
            this.stateByCharacter.delete(characterId);
            this.registry.sessionFor(characterId)?.send({
              type: "combat-log",
              kind: "condition",
              text: `The loot of ${monster.name} is available in your reward chest.`,
            });
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(
            `boss reward grant failed for ${characterId} (${deathEventId}): ${reason}`,
          );
        },
      );
    this.track(resolution);
  }

  private hasRoomFor(
    characterId: string,
    targets: ReadonlyArray<{ itemTypeId: number; count: number }>,
  ): boolean {
    const snapshot = this.items.inventorySnapshot(characterId);
    if (!snapshot) return false;
    const weight = targets.reduce(
      (total, item) =>
        total + (this.catalog.get(item.itemTypeId)?.weight ?? 0) * item.count,
      0,
    );
    return (
      carriedWeight(this.catalog, snapshot.items) + weight <=
      snapshot.capacityMax * 100
    );
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private fail(session: Session, reason: RewardActionFailedReason): void {
    session.send({ type: "reward-action-failed", reason });
  }
}
