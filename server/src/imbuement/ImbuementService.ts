import {
  IMBUEMENT_RULES,
  type ImbuementActionFailedReason,
  type ImbuementApplyMessage,
  type ImbuementClearMessage,
  type ImbuementScrollApplyMessage,
  type ImbuementScrollCreateMessage,
  type ImbuementSlotState,
  type ImbuementWindowGetMessage,
} from "@tibia/protocol";
import type { DepotService } from "../depot/DepotService";
import { itemImbuementsOf, type ItemImbuementEntry } from "../forge/itemImbuementsOf";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { buildImbuementOptions } from "./buildImbuementOptions";
import type { ImbuementCatalog } from "./ImbuementCatalog";
import { IMBUEMENT_SHRINE_ITEM_IDS } from "./imbuementShrineItemIds";
import type { ImbuementStore } from "./ImbuementStore";
import {
  planImbuementMaterials,
  type ImbuementMaterialPlan,
} from "./planImbuementMaterials";
import { ResolvedOutcomes } from "../ResolvedOutcomes";

/**
 * Imbuement shrine actions (Feature 78), transcribed from pinned Canary
 * player.cpp:2511-2788 and imbuements.cpp:469-634. Applying consumes the
 * astral sources and gold in one store transaction with the version-guarded
 * attribute write and the audit row; there is no success roll, mirroring
 * this Canary exactly (its XML percent is display-only).
 *
 * Astral sources come from carried rows first and the stash for the shortfall
 * (player.cpp:2707-2726). The stash share is reserved in the depot cache
 * synchronously inside the tick and written by the same store transaction as
 * the gold debit, so materials are never half-spent across two lanes; a
 * non-committed result restores the reservation in the outcome step.
 *
 * Decay is a one-second sweep over equipped items: aggressive categories
 * burn only while the wearer is in a fight outside protection zones,
 * non-aggressive ones whenever worn. The per-second countdown lives in a
 * service ledger; the durable attribute write happens every 60 qualifying
 * seconds, at expiry, and at detach, so the persist lane sees checkpoints,
 * not a write per second. Stricter than Canary: applying re-checks shrine
 * adjacency at execution time (upstream only gates the window open).
 */
const DECAY_CHECKPOINT_SECONDS = 60;

interface DecayLedgerEntry {
  /** Seconds burned since the last durable attribute checkpoint. */
  pendingSeconds: number;
}

export class ImbuementService {
  private readonly outcomes = new ResolvedOutcomes<[number]>();
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly decayLedger = new Map<string, Map<string, DecayLedgerEntry>>();
  private readonly lastSweepAt = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly items: ItemIntentHandler,
    private readonly itemCatalog: ItemCatalog,
    private readonly depot?: DepotService,
    private readonly catalog?: ImbuementCatalog,
    private readonly store?: ImbuementStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    this.outcomes.applyAll(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
  }

  detachCharacter(characterId: string, now: number): void {
    // Flush the pending countdown so a relog cannot rewind burned time.
    this.checkpointCharacter(characterId, now, true);
    this.decayLedger.delete(characterId);
    this.lastSweepAt.delete(characterId);
  }

  tick(now: number): void {
    if (!this.catalog) return;
    for (const session of this.registry.all()) {
      const characterId = session.playerId;
      if (!characterId) continue;
      const last = this.lastSweepAt.get(characterId) ?? now;
      const elapsedSeconds = Math.floor((now - last) / 1_000);
      if (elapsedSeconds < 1) continue;
      this.lastSweepAt.set(characterId, last + elapsedSeconds * 1_000);
      this.sweepCharacter(session, characterId, elapsedSeconds, now);
    }
  }

  handleWindowGet(
    session: Session,
    intent: ImbuementWindowGetMessage,
    now: number,
  ): void {
    const characterId = session.playerId;
    if (!characterId || !this.guard(session, now)) return;
    // Tibia only opens this window at the shrine; requiring adjacency here
    // too keeps the catalog and the player's own material counts off the
    // wire for anyone standing anywhere else.
    if (!this.nearShrine(characterId)) return this.fail(session, "no-shrine");
    if (intent.itemId === null) {
      return this.sendWindow(session, characterId, null, intent.mode, now);
    }
    const item = this.carriedItem(characterId, intent.itemId);
    if (!item) return this.fail(session, "invalid-item");
    this.sendWindow(session, characterId, item, intent.mode, now);
  }

  handleApply(session: Session, intent: ImbuementApplyMessage, now: number): void {
    const characterId = session.playerId;
    const catalog = this.catalog;
    const store = this.store;
    if (!characterId || !this.guard(session, now)) return;
    if (!catalog || !store) return;
    const player = this.world.getPlayer(characterId);
    if (!player) return;
    if (this.busy(session)) return this.fail(session, "rate-limited");
    if (!this.nearShrine(characterId)) return this.fail(session, "no-shrine");
    const item = this.carriedItem(characterId, intent.itemId);
    if (!item) return this.fail(session, "invalid-item");
    const type = this.itemCatalog.get(item.typeId);
    const slotCount = type?.imbuementSlots ?? 0;
    if (!type || intent.slot >= slotCount) {
      return this.fail(session, "invalid-slot");
    }
    const definition = catalog.imbuements.get(intent.imbuementId);
    const base = definition ? catalog.bases.get(definition.baseId) : undefined;
    if (!definition || !base) return this.fail(session, "invalid-request");
    const allowedLevel = type.imbuementTypes?.[definition.categorySlug] ?? 0;
    if (allowedLevel < definition.baseId) {
      return this.fail(session, "wrong-category");
    }
    const current = itemImbuementsOf(item);
    if (current.some((entry) => entry.slot === intent.slot)) {
      return this.fail(session, "slot-occupied");
    }
    // One imbuement per category across the item's slots
    // (player.cpp:2668-2679 blocks both the category and the name).
    if (
      current.some((entry) => {
        const other = catalog.imbuements.get(entry.imbuementId);
        return other?.categorySlug === definition.categorySlug;
      })
    ) {
      return this.fail(session, "duplicate-imbuement");
    }
    if (definition.premium && !player.isPremiumAt(now)) {
      return this.fail(session, "premium-required");
    }
    const plan = planImbuementMaterials({
      sources: definition.astralSources,
      carriedCountOf: (typeId) => this.carriedCount(characterId, typeId),
      stashCountOf: (typeId) => this.stashCount(characterId, typeId),
    });
    if (!plan) return this.fail(session, "insufficient-materials");
    const label = `${base.name} ${definition.name}`;
    const nextEntries: ItemImbuementEntry[] = [
      ...current,
      {
        slot: intent.slot,
        imbuementId: definition.id,
        remainingSeconds: base.durationSeconds,
        name: label,
        iconId: definition.iconId + (definition.baseId - 1),
        aggressive:
          catalog.categories.get(definition.categorySlug)?.aggressive ?? true,
      },
    ];
    this.runMutation(session, characterId, item, nextEntries, {
      plan,
      grants: [],
      goldCost: base.priceGold,
      auditEvent: "imbuement-apply",
      auditDetails: {
        itemId: item.id,
        imbuementId: definition.id,
        name: label,
        goldCost: base.priceGold,
        materials: definition.astralSources,
        stashDraws: plan.stash.map((draw) => ({
          itemTypeId: draw.itemTypeId,
          count: draw.drawn,
        })),
      },
    }, now);
  }

  handleClear(session: Session, intent: ImbuementClearMessage, now: number): void {
    const characterId = session.playerId;
    const catalog = this.catalog;
    const store = this.store;
    if (!characterId || !this.guard(session, now)) return;
    if (!catalog || !store) return;
    if (this.busy(session)) return this.fail(session, "rate-limited");
    if (!this.nearShrine(characterId)) return this.fail(session, "no-shrine");
    const item = this.carriedItem(characterId, intent.itemId);
    if (!item) return this.fail(session, "invalid-item");
    const current = itemImbuementsOf(item);
    const entry = current.find((candidate) => candidate.slot === intent.slot);
    if (!entry) return this.fail(session, "slot-empty");
    const nextEntries = current.filter(
      (candidate) => candidate.slot !== intent.slot,
    );
    this.runMutation(session, characterId, item, nextEntries, {
      plan: { carried: [], stash: [] },
      grants: [],
      goldCost: IMBUEMENT_RULES.removeCostGold,
      auditEvent: "imbuement-clear",
      auditDetails: {
        itemId: item.id,
        imbuementId: entry.imbuementId,
        goldCost: IMBUEMENT_RULES.removeCostGold,
      },
    }, now);
  }

  /**
   * Forges an imbuement scroll at the shrine (Canary
   * player.cpp:2548-2620 createScrollImbuement): a blank scroll plus the
   * imbuement's own astral sources and its base price buy a filled scroll.
   * The blank scroll is just another source, so it draws from the stash on
   * the same terms.
   */
  handleScrollCreate(
    session: Session,
    intent: ImbuementScrollCreateMessage,
    now: number,
  ): void {
    const characterId = session.playerId;
    const catalog = this.catalog;
    if (!characterId || !this.guard(session, now)) return;
    if (!catalog || !this.store) return;
    const player = this.world.getPlayer(characterId);
    if (!player) return;
    if (this.busy(session)) return this.fail(session, "rate-limited");
    if (!this.nearShrine(characterId)) return this.fail(session, "no-shrine");
    const definition = catalog.imbuements.get(intent.imbuementId);
    const base = definition ? catalog.bases.get(definition.baseId) : undefined;
    if (!definition || !base || definition.scrollItemTypeId === undefined) {
      return this.fail(session, "invalid-request");
    }
    if (definition.premium && !player.isPremiumAt(now)) {
      return this.fail(session, "premium-required");
    }
    const plan = planImbuementMaterials({
      sources: [
        ...definition.astralSources,
        { itemTypeId: IMBUEMENT_RULES.blankScrollItemTypeId, count: 1 },
      ],
      carriedCountOf: (typeId) => this.carriedCount(characterId, typeId),
      stashCountOf: (typeId) => this.stashCount(characterId, typeId),
    });
    if (!plan) {
      return this.fail(
        session,
        this.totalCount(characterId, IMBUEMENT_RULES.blankScrollItemTypeId) ===
          0
          ? "no-blank-scroll"
          : "insufficient-materials",
      );
    }
    this.runMutation(session, characterId, null, [], {
      plan,
      grants: [{ itemTypeId: definition.scrollItemTypeId, count: 1 }],
      goldCost: base.priceGold,
      auditEvent: "imbuement-scroll-create",
      auditDetails: {
        imbuementId: definition.id,
        name: `${base.name} ${definition.name}`,
        scrollItemTypeId: definition.scrollItemTypeId,
        goldCost: base.priceGold,
        materials: definition.astralSources,
        stashDraws: plan.stash.map((draw) => ({
          itemTypeId: draw.itemTypeId,
          count: draw.drawn,
        })),
      },
      mode: "scroll",
    }, now);
  }

  /**
   * Spends a filled scroll on a carried item (Canary player.cpp:2511-2546
   * applyScrollImbuement). No gold, no sources, no shrine: the scroll already
   * paid for all of it, and it lands in the item's first free slot.
   */
  handleScrollApply(
    session: Session,
    intent: ImbuementScrollApplyMessage,
    now: number,
  ): void {
    const characterId = session.playerId;
    const catalog = this.catalog;
    if (!characterId || !this.guard(session, now)) return;
    if (!catalog || !this.store) return;
    const player = this.world.getPlayer(characterId);
    if (!player) return;
    if (this.busy(session)) return this.fail(session, "rate-limited");
    const scroll = this.carriedItem(characterId, intent.scrollItemId);
    if (!scroll) return this.fail(session, "invalid-scroll");
    const definition = [...catalog.imbuements.values()].find(
      (candidate) => candidate.scrollItemTypeId === scroll.typeId,
    );
    const base = definition ? catalog.bases.get(definition.baseId) : undefined;
    if (!definition || !base) return this.fail(session, "invalid-scroll");
    const item = this.carriedItem(characterId, intent.itemId);
    if (!item) return this.fail(session, "invalid-item");
    const type = this.itemCatalog.get(item.typeId);
    if (!type) return this.fail(session, "invalid-item");
    const slotCount = Math.min(
      IMBUEMENT_RULES.maxSlots,
      type.imbuementSlots ?? 0,
    );
    const current = itemImbuementsOf(item);
    const allowedLevel = type.imbuementTypes?.[definition.categorySlug] ?? 0;
    if (allowedLevel < definition.baseId) {
      return this.fail(session, "wrong-category");
    }
    if (
      current.some(
        (entry) =>
          catalog.imbuements.get(entry.imbuementId)?.categorySlug ===
          definition.categorySlug,
      )
    ) {
      return this.fail(session, "duplicate-imbuement");
    }
    const occupied = new Set(current.map((entry) => entry.slot));
    let freeSlot = -1;
    for (let slot = 0; slot < slotCount; slot += 1) {
      if (!occupied.has(slot)) {
        freeSlot = slot;
        break;
      }
    }
    if (freeSlot < 0) return this.fail(session, "no-free-slot");
    const label = `${base.name} ${definition.name}`;
    this.runMutation(session, characterId, item, [
      ...current,
      {
        slot: freeSlot,
        imbuementId: definition.id,
        remainingSeconds: base.durationSeconds,
        name: label,
        iconId: definition.iconId + (definition.baseId - 1),
        aggressive:
          catalog.categories.get(definition.categorySlug)?.aggressive ?? true,
      },
    ], {
      plan: {
        carried: [{ itemTypeId: scroll.typeId, count: 1 }],
        stash: [],
      },
      grants: [],
      goldCost: 0,
      auditEvent: "imbuement-scroll-apply",
      auditDetails: {
        itemId: item.id,
        imbuementId: definition.id,
        name: label,
        scrollItemTypeId: scroll.typeId,
        slot: freeSlot,
      },
    }, now);
  }

  private runMutation(
    session: Session,
    characterId: string,
    item: Item | null,
    entries: ReadonlyArray<ItemImbuementEntry>,
    request: {
      plan: ImbuementMaterialPlan;
      grants: ReadonlyArray<{ itemTypeId: number; count: number }>;
      goldCost: number;
      auditEvent:
        | "imbuement-apply"
        | "imbuement-clear"
        | "imbuement-scroll-create"
        | "imbuement-scroll-apply";
      auditDetails: Readonly<Record<string, unknown>>;
      mode?: "item" | "scroll";
    },
    now: number,
  ): void {
    const store = this.store;
    if (!store) return;
    const attributes: Record<string, unknown> = { ...item?.attributes };
    if (entries.length > 0) attributes.imbuements = entries;
    else delete attributes.imbuements;
    void now;
    // Reserve the stash share before the await: from here on the sources are
    // spent as far as every other intent this tick can see (charter rule 3).
    const restore = this.reserveStash(characterId, request.plan);
    session.itemOperationPending = true;
    const resolution = store
      .mutate(characterId, {
        itemId: item?.id ?? null,
        expectedVersion: item?.version ?? 0,
        attributes,
        materials: request.plan.carried,
        stashOps: request.plan.stash.map((draw) => ({
          itemTypeId: draw.itemTypeId,
          count: draw.remaining,
        })),
        grants: request.grants,
        goldCost: request.goldCost,
        auditEvent: request.auditEvent,
        auditDetails: request.auditDetails,
      })
      .then(
        (result) => {
          this.outcomes.push((at) => {
            session.itemOperationPending = false;
            if (result.status !== "committed") {
              restore();
              if (session.playerId === characterId) {
                this.fail(
                  session,
                  result.status === "conflict" || result.status === "no-space"
                    ? "invalid-request"
                    : result.status,
                );
              }
              return;
            }
            this.items.applyCommittedMutation(
              session,
              characterId,
              result.mutation,
              at,
            );
            // The debit happened inside the transaction; without this the
            // cached balance drifts and every later affordability read is
            // wrong until the character reloads.
            if (result.bankBalanceAfter !== undefined) {
              this.items.setBankBalance(characterId, result.bankBalanceAfter);
              if (session.playerId === characterId) {
                session.send({
                  type: "bank-updated",
                  balance: result.bankBalanceAfter,
                });
              }
            }
            // A fresh apply restarts this item's checkpoint ledger.
            if (item) this.decayLedger.get(characterId)?.delete(item.id);
            if (session.playerId === characterId) {
              const updated = item
                ? this.carriedItem(characterId, item.id)
                : null;
              this.sendWindow(
                session,
                characterId,
                updated,
                request.mode ?? "item",
                at,
              );
            }
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(
            `imbuement mutation failed for ${characterId}: ${reason}`,
          );
          this.outcomes.push(() => {
            session.itemOperationPending = false;
            restore();
            if (session.playerId === characterId) {
              this.fail(session, "invalid-request");
            }
          });
        },
      );
    this.track(resolution);
    this.items.trackExternalOperation(characterId, resolution);
  }

  /**
   * Decrements the reserved stash counts in the depot cache and returns the
   * undo. Idempotent: the undo restores the pre-reservation absolute counts,
   * so a late restore after the player stashed more of the same type cannot
   * be triggered twice.
   */
  private reserveStash(
    characterId: string,
    plan: ImbuementMaterialPlan,
  ): () => void {
    const depot = this.depot;
    if (!depot || plan.stash.length === 0) return () => undefined;
    const before = plan.stash.map((draw) => ({
      itemTypeId: draw.itemTypeId,
      count: draw.remaining + draw.drawn,
    }));
    depot.setStashCounts(
      characterId,
      plan.stash.map((draw) => ({
        itemTypeId: draw.itemTypeId,
        count: draw.remaining,
      })),
    );
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      depot.setStashCounts(characterId, before);
    };
  }

  private sweepCharacter(
    session: Session,
    characterId: string,
    elapsedSeconds: number,
    now: number,
  ): void {
    const catalog = this.catalog;
    if (!catalog) return;
    const player = this.world.getPlayer(characterId);
    if (!player) return;
    const aggressiveBurns =
      player.conditions.has("combat-lock") &&
      !this.world.isProtectionZone(player.position);
    const ledger = this.ledgerOf(characterId);
    for (const entry of this.items.combatEquipment(characterId)) {
      const states = itemImbuementsOf(entry.item);
      if (states.length === 0) {
        ledger.delete(entry.item.id);
        continue;
      }
      const burnsAny = states.some((state) => {
        const definition = catalog.imbuements.get(state.imbuementId);
        const category = definition
          ? catalog.categories.get(definition.categorySlug)
          : undefined;
        return category ? (category.aggressive ? aggressiveBurns : true) : false;
      });
      if (!burnsAny) continue;
      const itemLedger = ledger.get(entry.item.id) ?? { pendingSeconds: 0 };
      itemLedger.pendingSeconds += elapsedSeconds;
      ledger.set(entry.item.id, itemLedger);
      const expiresNow = states.some((state) => {
        const definition = catalog.imbuements.get(state.imbuementId);
        const category = definition
          ? catalog.categories.get(definition.categorySlug)
          : undefined;
        const burns = category
          ? category.aggressive
            ? aggressiveBurns
            : true
          : false;
        return burns && state.remainingSeconds <= itemLedger.pendingSeconds;
      });
      if (
        expiresNow ||
        itemLedger.pendingSeconds >= DECAY_CHECKPOINT_SECONDS
      ) {
        this.checkpointItem(
          session,
          characterId,
          entry.item,
          itemLedger.pendingSeconds,
          aggressiveBurns,
          now,
        );
        ledger.delete(entry.item.id);
      }
    }
  }

  /** Writes the burned seconds into the item's attributes, memory-first. */
  private checkpointItem(
    session: Session,
    characterId: string,
    item: Item,
    burnedSeconds: number,
    aggressiveBurns: boolean,
    now: number,
  ): void {
    const catalog = this.catalog;
    if (!catalog) return;
    const states = itemImbuementsOf(item);
    const next: ItemImbuementEntry[] = [];
    let changed = false;
    for (const state of states) {
      const definition = catalog.imbuements.get(state.imbuementId);
      const category = definition
        ? catalog.categories.get(definition.categorySlug)
        : undefined;
      const burns = category
        ? category.aggressive
          ? aggressiveBurns
          : true
        : false;
      if (!burns) {
        next.push(state);
        continue;
      }
      changed = true;
      const remaining = state.remainingSeconds - burnedSeconds;
      if (remaining > 0) next.push({ ...state, remainingSeconds: remaining });
      else if (session.playerId === characterId && state.name) {
        session.send({
          type: "combat-log",
          kind: "condition",
          text: `Your ${state.name} imbuement has worn off.`,
        });
      }
    }
    if (!changed) return;
    const attributes: Record<string, unknown> = { ...item.attributes };
    if (next.length > 0) attributes.imbuements = next;
    else delete attributes.imbuements;
    const updated: Item = {
      ...item,
      attributes,
      version: item.version + 1,
    };
    this.items.applyWorldPlan(
      session,
      characterId,
      {
        mutation: { before: item, after: [updated] },
        persist: {
          characterId,
          rowOps: [
            { kind: "write", expectedVersion: item.version, item: updated },
          ],
          audits: [],
        },
      },
      now,
    );
  }

  private checkpointCharacter(
    characterId: string,
    now: number,
    force: boolean,
  ): void {
    const ledger = this.decayLedger.get(characterId);
    if (!ledger || ledger.size === 0) return;
    const session = this.registry.sessionFor(characterId);
    const player = this.world.getPlayer(characterId);
    if (!session || !player) return;
    const aggressiveBurns =
      player.conditions.has("combat-lock") &&
      !this.world.isProtectionZone(player.position);
    for (const entry of this.items.combatEquipment(characterId)) {
      const itemLedger = ledger.get(entry.item.id);
      if (!itemLedger || (!force && itemLedger.pendingSeconds === 0)) continue;
      this.checkpointItem(
        session,
        characterId,
        entry.item,
        itemLedger.pendingSeconds,
        aggressiveBurns,
        now,
      );
      ledger.delete(entry.item.id);
    }
  }

  /** `item` is null for the shrine's "Pick Item" state and for scroll mode. */
  private sendWindow(
    session: Session,
    characterId: string,
    item: Item | null,
    mode: "item" | "scroll",
    now: number,
  ): void {
    const catalog = this.catalog;
    if (!catalog) return;
    const player = this.world.getPlayer(characterId);
    if (!player) return;
    const type = item ? this.itemCatalog.get(item.typeId) : null;
    if (item && !type) return;
    const slotCount = Math.min(
      IMBUEMENT_RULES.maxSlots,
      type?.imbuementSlots ?? 0,
    );
    const states = item ? itemImbuementsOf(item) : [];
    const slots: ImbuementSlotState[] = [];
    for (let slot = 0; slot < slotCount; slot += 1) {
      const state = states.find((candidate) => candidate.slot === slot);
      const definition = state
        ? catalog.imbuements.get(state.imbuementId)
        : undefined;
      slots.push({
        slot,
        imbuementId: state?.imbuementId ?? null,
        name: definition?.name ?? null,
        baseName: definition
          ? catalog.bases.get(definition.baseId)?.name ?? null
          : null,
        iconId: definition ? definition.iconId + (definition.baseId - 1) : null,
        remainingSeconds: Math.min(
          IMBUEMENT_RULES.durationSeconds,
          state?.remainingSeconds ?? 0,
        ),
      });
    }
    const blankScrollCount = this.totalCount(
      characterId,
      IMBUEMENT_RULES.blankScrollItemTypeId,
    );
    session.send({
      type: "imbuement-window-state",
      mode,
      itemId: item?.id ?? null,
      itemTypeId: item?.typeId ?? null,
      slotCount,
      slots,
      options: buildImbuementOptions({
        catalog,
        itemCatalog: this.itemCatalog,
        imbuementTypes: type?.imbuementTypes ?? null,
        currentStates: states,
        premium: player.isPremiumAt(now),
        mode,
        blankScrollCount,
        carriedCountOf: (typeId) => this.carriedCount(characterId, typeId),
        stashCountOf: (typeId) => this.stashCount(characterId, typeId),
      }),
      removeCostGold: IMBUEMENT_RULES.removeCostGold,
      blankScrollCount,
      bankBalance: this.items.inventorySnapshot(characterId)?.bankBalance ?? 0,
    });
  }

  private carriedItem(characterId: string, itemId: string): Item | null {
    const snapshot = this.items.inventorySnapshot(characterId);
    return snapshot?.items.find((item) => item.id === itemId) ?? null;
  }

  private carriedCount(characterId: string, itemTypeId: number): number {
    const snapshot = this.items.inventorySnapshot(characterId);
    return (
      snapshot?.items.reduce(
        (total, item) =>
          item.typeId === itemTypeId ? total + item.count : total,
        0,
      ) ?? 0
    );
  }

  private stashCount(characterId: string, itemTypeId: number): number {
    return this.depot?.stashCountOf(characterId, itemTypeId) ?? 0;
  }

  /** Carried + stashed, the pool Canary checks sources against. */
  private totalCount(characterId: string, itemTypeId: number): number {
    return (
      this.carriedCount(characterId, itemTypeId) +
      this.stashCount(characterId, itemTypeId)
    );
  }

  /**
   * True while any item write for this session is still in flight. Depot
   * operations count too: the stash draw writes rows the depot persist lane
   * also owns, and this gate is what keeps the two off the same rows at once.
   */
  private busy(session: Session): boolean {
    return (
      session.itemOperationPending ||
      session.depotOperationPending ||
      session.itemPersistsPending > 0
    );
  }

  private nearShrine(characterId: string): boolean {
    const player = this.world.getPlayer(characterId);
    if (!player) return false;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const position = {
          x: player.position.x + dx,
          y: player.position.y + dy,
          z: player.position.z,
        };
        if (
          this.world
            .getMapItems(position)
            .some((mapItem) => IMBUEMENT_SHRINE_ITEM_IDS.has(mapItem.itemId))
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private ledgerOf(characterId: string): Map<string, DecayLedgerEntry> {
    const existing = this.decayLedger.get(characterId);
    if (existing) return existing;
    const fresh = new Map<string, DecayLedgerEntry>();
    this.decayLedger.set(characterId, fresh);
    return fresh;
  }

  private guard(session: Session, now: number): boolean {
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) return false;
    this.cooldownBySession.set(
      session.id,
      now + IMBUEMENT_RULES.actionCooldownMs,
    );
    return true;
  }

  private fail(session: Session, reason: ImbuementActionFailedReason): void {
    session.send({ type: "imbuement-action-failed", reason });
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
