import {
  TRADE_LIMITS,
  type TradeActionFailedReason,
  type TradeClosedReason,
  type TradeOfferEntry,
  type TradeRequestMessage,
} from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { ItemStore } from "../item/ItemStore";
import { projectItem } from "../item/projectItem";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { planTradeReservation } from "./planTradeReservation";
import { planTradeRestore } from "./planTradeRestore";
import type { TradeIntent } from "./TradeIntent";
import { TradeSession, type TradeSide } from "./TradeSession";
import type { TradeCommitResult, TradeStore } from "./TradeStore";
import { tradeOfferSubtree } from "./tradeOfferSubtree";
import { withinTradeRange } from "./withinTradeRange";

/**
 * Player-to-player trade (Canary-parity rules on project-native storage).
 * Offering moves the item onto the character's `trade-reservation` slot in
 * one synchronous memory mutation (persisted through the ordered item write
 * lane), so every other move/consume path rejects it structurally while the
 * trade is open. The commit swaps both legs in one serializable transaction
 * carrying both audit entries, serialized behind pending item writes; every
 * cancel path restores both reserved offers, and reservations orphaned by a
 * crash or offline cancel are restored at the owner's next login.
 */
export class TradeService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly tradesByCharacter = new Map<string, TradeSession>();
  private readonly recoveryPending = new Set<string>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly items: ItemIntentHandler,
    private readonly itemStore: ItemStore,
    private readonly catalog: ItemCatalog,
    private readonly store?: TradeStore,
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

  /** Runs before the item caches detach so the restore still lands in memory. */
  detachCharacter(characterId: string, now: number): void {
    const trade = this.tradesByCharacter.get(characterId);
    if (!trade) return;
    // A committing trade finishes on its own; finishCommit copes with either
    // side being offline (delivery loads at next login, restores recover).
    if (trade.phase === "negotiating") {
      this.cancelTrade(trade, "disconnected", now);
    }
  }

  handle(session: Session, intent: TradeIntent, now: number): void {
    const characterId = session.playerId;
    if (!this.store || !characterId || !this.world.getPlayer(characterId)) {
      this.fail(session, "unavailable");
      return;
    }
    if (intent.type === "trade-cancel") {
      const trade = this.tradesByCharacter.get(characterId);
      if (trade) this.cancelTrade(trade, "cancelled", now);
      return;
    }
    if (this.items.isPersistPoisoned(characterId)) {
      this.fail(session, "failed");
      return;
    }
    if (session.itemOperationPending || this.recoveryPending.has(characterId)) {
      this.fail(session, "busy");
      return;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) {
      this.fail(session, "cooldown");
      return;
    }
    this.cooldownBySession.set(session.id, now + TRADE_LIMITS.actionCooldownMs);
    if (intent.type === "trade-request") {
      this.request(session, characterId, intent, now);
      return;
    }
    this.accept(session, characterId, now);
  }

  tick(now: number): void {
    const seen = new Set<TradeSession>();
    for (const trade of [...this.tradesByCharacter.values()]) {
      if (seen.has(trade) || trade.phase !== "negotiating") continue;
      seen.add(trade);
      const [a, b] = trade.sides;
      const playerA = this.world.getPlayer(a.characterId);
      const playerB = this.world.getPlayer(b.characterId);
      if (!playerA || !playerB) {
        this.cancelTrade(trade, "disconnected", now);
        continue;
      }
      if (!withinTradeRange(playerA.position, playerB.position)) {
        this.cancelTrade(trade, "moved-away", now);
        continue;
      }
      if (now - trade.lastActivityAt > TRADE_LIMITS.inactivityTimeoutMs) {
        this.cancelTrade(trade, "timeout", now);
      }
    }
  }

  /**
   * Restores trade-reservation rows left behind by a crash or an offline
   * cancel. Called after the inventory cache attaches at login; trading is
   * blocked for the character until the recovery resolves.
   */
  recoverOrphans(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) return;
    this.recoveryPending.add(characterId);
    const operation = store.loadReservations(characterId).then(
      (reserved) => {
        this.outcomes.push((now) => {
          this.recoveryPending.delete(characterId);
          if (reserved.length === 0 || session.playerId !== characterId) {
            return;
          }
          const roots = reserved.filter(
            (item) => item.location.kind === "trade-reservation",
          );
          for (const root of roots) {
            const snapshot = tradeOfferSubtree(reserved, root.id).map(
              (entry) => entry.item,
            );
            if (!this.restoreSnapshot(characterId, snapshot, now)) {
              // No space to restore; keep trading blocked so the occupied
              // reservation slot cannot collide with a fresh offer.
              this.recoveryPending.add(characterId);
              console.warn(
                `trade recovery for ${characterId} found no free inventory slot; retrying at next login`,
              );
            }
          }
        });
      },
      (cause: unknown) => {
        this.warn(characterId, cause);
        this.outcomes.push(() => this.recoveryPending.delete(characterId));
      },
    );
    this.track(operation);
  }

  private request(
    session: Session,
    characterId: string,
    intent: TradeRequestMessage,
    now: number,
  ): void {
    const player = this.world.getPlayer(characterId);
    const target = this.world.getPlayer(intent.targetPlayerId);
    if (!player || !target || target.id === characterId) {
      this.fail(session, "not-possible");
      return;
    }
    if (!withinTradeRange(player.position, target.position)) {
      this.fail(session, "too-far-away");
      return;
    }
    if (!this.world.hasLineOfSight(player.position, target.position)) {
      this.fail(session, "not-reachable");
      return;
    }
    const mine = this.tradesByCharacter.get(characterId);
    const theirs = this.tradesByCharacter.get(target.id);
    if (mine) {
      // The one legal re-entry: the invited side answering its inviter.
      const answering =
        mine.phase === "negotiating" &&
        mine.partnerOf(characterId)?.characterId === target.id &&
        mine.side(characterId)?.offer === null;
      if (!answering) {
        this.fail(session, "already-trading");
        return;
      }
    } else if (theirs) {
      this.fail(session, "partner-already-trading");
      return;
    }
    const cache = this.items.inventorySnapshot(characterId);
    if (!cache) {
      this.fail(session, "unavailable");
      return;
    }
    const planned = planTradeReservation({
      characterId,
      items: cache.items,
      itemId: intent.itemId,
      expectedVersion: intent.revision,
    });
    if (!planned) {
      this.fail(session, "not-possible");
      return;
    }
    if (planned.snapshot.length > TRADE_LIMITS.maxOfferedItems) {
      this.fail(session, "too-many-items");
      return;
    }
    // Reserve synchronously — no yield between the check and the mutation
    // (charter rule 3); the DB write queues behind it on the ordered lane.
    this.items.applyCommittedMutation(
      session,
      characterId,
      planned.plan.mutation,
      now,
    );
    const persist = planned.plan.persist;
    this.items.enqueuePersist(session, characterId, () =>
      this.itemStore.persist(persist),
    );
    let trade = mine;
    if (trade) {
      trade.setOffer(characterId, planned.snapshot, now);
    } else {
      trade = new TradeSession(characterId, target.id, planned.snapshot, now);
      this.tradesByCharacter.set(characterId, trade);
      this.tradesByCharacter.set(target.id, trade);
    }
    this.sendState(trade);
  }

  private accept(session: Session, characterId: string, now: number): void {
    const trade = this.tradesByCharacter.get(characterId);
    if (!trade || trade.phase !== "negotiating") {
      this.fail(session, "not-possible");
      return;
    }
    const partner = trade.partnerOf(characterId);
    const me = trade.side(characterId);
    if (!partner || !me) {
      this.fail(session, "not-possible");
      return;
    }
    if (me.accepted) return;
    const player = this.world.getPlayer(characterId);
    const other = this.world.getPlayer(partner.characterId);
    if (
      !player ||
      !other ||
      !withinTradeRange(player.position, other.position) ||
      !this.world.hasLineOfSight(player.position, other.position)
    ) {
      this.cancelTrade(trade, "moved-away", now);
      return;
    }
    const partnerSession = this.registry.sessionFor(partner.characterId);
    if (!partnerSession) {
      this.cancelTrade(trade, "disconnected", now);
      return;
    }
    if (partner.accepted && partnerSession.itemOperationPending) {
      // The swap would start now; wait until the partner's item flow settles.
      this.fail(session, "busy");
      return;
    }
    const result = trade.accept(characterId, now);
    if (result === "not-ready") {
      this.fail(session, "not-ready");
      return;
    }
    if (result === "rejected") {
      this.fail(session, "not-possible");
      return;
    }
    this.sendState(trade);
    if (trade.bothAccepted) {
      this.beginCommit(trade, session, partnerSession, now);
    }
  }

  private beginCommit(
    trade: TradeSession,
    session: Session,
    partnerSession: Session,
    now: number,
  ): void {
    const store = this.store;
    const [a, b] = trade.sides;
    if (!store || !a.offer || !b.offer) {
      this.cancelTrade(trade, "failed", now);
      return;
    }
    trade.beginCommit();
    // Freeze both inventories while the swap is in flight.
    session.itemOperationPending = true;
    partnerSession.itemOperationPending = true;
    const capacityOf = (characterId: string) =>
      this.items.inventorySnapshot(characterId)?.capacityMax ?? 0;
    const input = {
      tradeId: trade.id,
      legs: [
        {
          giverCharacterId: a.characterId,
          receiverCharacterId: b.characterId,
          items: a.offer,
          receiverCapacityMax: capacityOf(b.characterId),
        },
        {
          giverCharacterId: b.characterId,
          receiverCharacterId: a.characterId,
          items: b.offer,
          receiverCapacityMax: capacityOf(a.characterId),
        },
      ] as const,
    };
    const operation = this.items
      .runOrderedInternalOperation(() => store.commitTrade(input))
      .then(
        (result) => {
          this.outcomes.push((at) => this.finishCommit(trade, result, at));
        },
        (cause: unknown) => {
          this.warn(a.characterId, cause);
          this.outcomes.push((at) =>
            this.finishCommit(trade, { status: "failed" }, at),
          );
        },
      );
    this.track(operation);
    this.items.trackExternalOperation(a.characterId, operation);
    this.items.trackExternalOperation(b.characterId, operation);
  }

  private finishCommit(
    trade: TradeSession,
    result: TradeCommitResult,
    now: number,
  ): void {
    const [a, b] = trade.sides;
    const sessionA = this.registry.sessionFor(a.characterId);
    const sessionB = this.registry.sessionFor(b.characterId);
    if (sessionA) sessionA.itemOperationPending = false;
    if (sessionB) sessionB.itemOperationPending = false;
    if (result.status === "committed") {
      this.deliver(b.characterId, result.delivered[0], now);
      this.deliver(a.characterId, result.delivered[1], now);
      this.sendClosed(trade, "completed");
    } else {
      this.restoreSide(a, now);
      this.restoreSide(b, now);
      this.sendClosed(
        trade,
        result.status === "failed" ? "failed" : result.status,
      );
    }
    this.clearTrade(trade);
  }

  private deliver(
    receiverCharacterId: string,
    delivered: ReadonlyArray<Item>,
    now: number,
  ): void {
    const session = this.registry.sessionFor(receiverCharacterId);
    if (!session || session.playerId !== receiverCharacterId) return;
    // Offline receivers get the rows at their next inventory load.
    this.items.applyCommittedMutation(
      session,
      receiverCharacterId,
      { after: delivered },
      now,
    );
  }

  private cancelTrade(
    trade: TradeSession,
    reason: TradeClosedReason,
    now: number,
  ): void {
    if (trade.phase !== "negotiating") return;
    trade.close();
    this.restoreSide(trade.sides[0], now);
    this.restoreSide(trade.sides[1], now);
    this.sendClosed(trade, reason);
    this.clearTrade(trade);
  }

  private restoreSide(side: TradeSide, now: number): void {
    if (!side.offer) return;
    this.restoreSnapshot(side.characterId, side.offer, now);
  }

  private restoreSnapshot(
    characterId: string,
    snapshot: ReadonlyArray<Item>,
    now: number,
  ): boolean {
    const session = this.registry.sessionFor(characterId);
    const cache = this.items.inventorySnapshot(characterId);
    // Offline owners recover at next login via recoverOrphans.
    if (!session || session.playerId !== characterId || !cache) return true;
    const plan = planTradeRestore({
      characterId,
      catalog: this.catalog,
      items: cache.items,
      snapshot,
    });
    if (!plan) return false;
    this.items.applyCommittedMutation(session, characterId, plan.mutation, now);
    const persist = plan.persist;
    this.items.enqueuePersist(session, characterId, () =>
      this.itemStore.persist(persist),
    );
    return true;
  }

  private sendState(trade: TradeSession): void {
    for (const side of trade.sides) {
      const partner = trade.partnerOf(side.characterId);
      const session = this.registry.sessionFor(side.characterId);
      if (!partner || !session) continue;
      const partnerName =
        this.world.getPlayer(partner.characterId)?.name ?? "?";
      session.send({
        type: "trade-state",
        partnerId: partner.characterId,
        partnerName,
        ownOffer: this.projectOffer(side.offer),
        partnerOffer: this.projectOffer(partner.offer),
        ownAccepted: side.accepted,
        partnerAccepted: partner.accepted,
      });
    }
  }

  private projectOffer(
    offer: ReadonlyArray<Item> | null,
  ): TradeOfferEntry[] | null {
    const root = offer?.[0];
    if (!root) return null;
    return tradeOfferSubtree(offer, root.id).map((entry) => ({
      item: projectItem(entry.item, this.catalog),
      depth: entry.depth,
    }));
  }

  private sendClosed(trade: TradeSession, reason: TradeClosedReason): void {
    for (const side of trade.sides) {
      const session = this.registry.sessionFor(side.characterId);
      if (session?.playerId === side.characterId) {
        session.send({ type: "trade-closed", reason });
      }
    }
  }

  private clearTrade(trade: TradeSession): void {
    trade.close();
    for (const side of trade.sides) {
      if (this.tradesByCharacter.get(side.characterId) === trade) {
        this.tradesByCharacter.delete(side.characterId);
      }
    }
  }

  private fail(session: Session, reason: TradeActionFailedReason): void {
    session.send({ type: "trade-action-failed", reason });
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(characterId: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(
      `trade operation failed for character ${characterId}: ${reason}`,
    );
  }
}
