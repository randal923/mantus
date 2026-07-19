import {
  HOUSE_LIMITS,
  type HouseAbandonMessage,
  type HouseActionFailedReason,
  type HouseBrowseMessage,
  type HouseBuyMessage,
  type HouseEventMessage,
  type HouseKickMessage,
  type HouseListEntry,
  type HouseOpenMessage,
  type HouseSetAccessMessage,
  type HouseTransferCancelMessage,
  type HouseTransferOfferMessage,
  type HouseTransferRespondMessage,
  type Position,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { DepotService } from "../depot/DepotService";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import type { HouseInfo } from "./HouseInfo";
import { HouseRegistry } from "./HouseRegistry";
import type {
  ChargeHouseRentResult,
  HouseEvictionDelivery,
  HouseStore,
} from "./HouseStore";
import { projectHouseStateFor } from "./projectHouseStateFor";

type HouseIntent =
  | HouseOpenMessage
  | HouseBuyMessage
  | HouseAbandonMessage
  | HouseTransferOfferMessage
  | HouseTransferRespondMessage
  | HouseTransferCancelMessage
  | HouseSetAccessMessage
  | HouseKickMessage
  | HouseBrowseMessage;

interface PendingHouseTransfer {
  readonly fromCharacterId: string;
  readonly fromName: string;
  readonly targetCharacterId: string;
  readonly targetName: string;
  readonly price: number;
}

const RENT_SCAN_INTERVAL_MS = 60_000;
const RENT_BATCH_LIMIT = 20;
const DAY_MS = 24 * 3600 * 1000;
const RENT_PERIOD_MS = HOUSE_LIMITS.rentPeriodDays * DAY_MS;

/**
 * Server-authoritative house system. Ownership, rent, and access live in
 * durable storage; an in-memory registry mirror (loaded at boot, updated
 * only from store outcomes inside the tick) answers the synchronous
 * walk/door/item authorization checks. Money-touching operations are
 * DB-first serializable transactions; their results — including the item
 * eviction legs — are applied to world, depot cache, and registry in one
 * tick (charter rules 2-5).
 */
export class HouseService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly opPendingByCharacter = new Set<string>();
  private readonly houses = new HouseRegistry();
  private readonly pendingTransfers = new Map<number, PendingHouseTransfer>();
  private nextRentScanAt = 0;
  private rentScanActive = false;
  private loaded = false;

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
    private readonly depot: DepotService,
    private readonly content: ReadonlyMap<number, HouseInfo>,
    private readonly store?: HouseStore,
  ) {
    this.loadAllFromStore();
  }

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
  }

  /** Runs inside the tick before the player leaves the world. */
  detachCharacter(characterId: string): void {
    this.opPendingByCharacter.delete(characterId);
    for (const [houseId, pending] of [...this.pendingTransfers]) {
      if (
        pending.fromCharacterId !== characterId &&
        pending.targetCharacterId !== characterId
      ) {
        continue;
      }
      this.pendingTransfers.delete(houseId);
      const otherId =
        pending.fromCharacterId === characterId
          ? pending.targetCharacterId
          : pending.fromCharacterId;
      this.sendEventTo(otherId, {
        type: "house-event",
        kind: "transfer-cancelled",
        houseName: this.content.get(houseId)?.name ?? "?",
      });
    }
  }

  /**
   * Execution-time tile authorization: true when the position is not a house
   * tile, or the character is at least a guest of the (owned) house. Unowned
   * and unknown houses fail closed.
   */
  canUseHouseTile(characterId: string, position: Position): boolean {
    const houseId = this.world.getHouseId(position);
    if (houseId === undefined) return true;
    return this.houses.accessLevel(houseId, characterId) !== "none";
  }

  handle(session: Session, intent: HouseIntent, now: number): void {
    const characterId = session.playerId;
    const player = characterId ? this.world.getPlayer(characterId) : undefined;
    if (!characterId || !player) {
      session.sendError("join-required");
      return;
    }
    if (intent.type === "house-open") {
      this.open(session, characterId, player, intent);
      return;
    }
    if (intent.type === "house-browse") {
      this.browse(session, intent);
      return;
    }
    if (!this.store) {
      this.fail(session, "invalid-request");
      return;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt || this.opPendingByCharacter.has(characterId)) {
      this.fail(session, "rate-limited");
      return;
    }
    this.cooldownBySession.set(session.id, now + HOUSE_LIMITS.actionCooldownMs);
    switch (intent.type) {
      case "house-buy":
        this.buy(session, characterId, player, intent.houseId, now);
        return;
      case "house-abandon":
        this.abandon(session, characterId);
        return;
      case "house-transfer-offer":
        this.offerTransfer(session, characterId, player, intent);
        return;
      case "house-transfer-respond":
        this.respondTransfer(session, characterId, player, intent, now);
        return;
      case "house-transfer-cancel":
        this.cancelTransfer(session, characterId);
        return;
      case "house-set-access":
        this.setAccess(session, characterId, intent);
        return;
      case "house-kick":
        this.kick(session, characterId, player, intent, now);
        return;
    }
  }

  tick(now: number): void {
    const store = this.store;
    if (
      !store ||
      !this.loaded ||
      this.rentScanActive ||
      now < this.nextRentScanAt
    ) {
      return;
    }
    this.nextRentScanAt = now + RENT_SCAN_INTERVAL_MS;
    this.rentScanActive = true;
    const operation = (async () => {
      const dueIds = await store.listDueHouseIds(new Date(now), RENT_BATCH_LIMIT);
      for (const houseId of dueIds) {
        const info = this.content.get(houseId);
        if (!info) continue;
        // Each house charges in its own transaction guarded on current DB
        // state, so a crash between houses or a replay cannot double-charge.
        const result = await store.chargeRent({
          houseId,
          rent: info.rent,
          now: new Date(now),
          rentPeriodMs: RENT_PERIOD_MS,
          warningGraceMs: DAY_MS,
          maxWarnings: HOUSE_LIMITS.maxWarnings,
          mapName: this.world.mapName,
          tilePositions: this.world.getHouseTiles(houseId),
        });
        this.outcomes.push((at) =>
          this.applyRentResult(houseId, info, result, at),
        );
      }
    })()
      .catch((cause: unknown) => this.warn("rent-scan", cause))
      .finally(() => {
        this.rentScanActive = false;
      });
    this.track(operation);
  }

  private open(
    session: Session,
    characterId: string,
    player: Player,
    intent: HouseOpenMessage,
  ): void {
    const houseId =
      intent.houseId ??
      this.world.getHouseId(player.position) ??
      this.houses.ownedBy(characterId);
    if (houseId === undefined || !this.content.has(houseId)) {
      session.send({ type: "house-state", house: null });
      return;
    }
    this.sendHouseState(session, characterId, houseId);
  }

  private browse(session: Session, intent: HouseBrowseMessage): void {
    const entries: HouseListEntry[] = [];
    for (const info of this.content.values()) {
      if (intent.townId !== undefined && info.townId !== intent.townId) continue;
      const townName = this.world.townName(info.townId);
      entries.push({
        houseId: info.houseId,
        name: info.name,
        size: info.size,
        rent: info.rent,
        townId: info.townId,
        ...(townName ? { townName } : {}),
        guildhall: info.guildhall,
        ownerName: this.houses.get(info.houseId)?.ownerName ?? null,
      });
    }
    entries.sort((left, right) => left.houseId - right.houseId);
    const totalPages = Math.ceil(entries.length / HOUSE_LIMITS.listPageSize);
    const page = Math.min(intent.page ?? 0, Math.max(totalPages - 1, 0));
    session.send({
      type: "house-list",
      entries: entries.slice(
        page * HOUSE_LIMITS.listPageSize,
        (page + 1) * HOUSE_LIMITS.listPageSize,
      ),
      page,
      totalPages,
      ...(intent.townId !== undefined ? { townId: intent.townId } : {}),
    });
  }

  private buy(
    session: Session,
    characterId: string,
    player: Player,
    houseId: number,
    now: number,
  ): void {
    const info = this.content.get(houseId);
    if (!info) {
      this.fail(session, "not-found");
      return;
    }
    // Pre-screens on the registry cache; the store re-checks ownership and
    // funds inside the transaction at execution time (charter rule 4).
    if (info.guildhall) {
      this.fail(session, "guildhall");
      return;
    }
    if (player.level < HOUSE_LIMITS.buyLevel) {
      this.fail(session, "level-too-low");
      return;
    }
    if (this.houses.get(houseId)) {
      this.fail(session, "already-owned");
      return;
    }
    if (this.houses.ownedBy(characterId) !== undefined) {
      this.fail(session, "own-house-exists");
      return;
    }
    if (!this.isAtHouse(player.position, houseId)) {
      this.fail(session, "not-at-entry");
      return;
    }
    const store = this.requireStore();
    const price = info.size * HOUSE_LIMITS.pricePerSqm;
    this.enqueue(characterId, async () => {
      const result = await store.purchase({
        houseId,
        characterId,
        price,
        paidUntilMs: now + RENT_PERIOD_MS,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      return () => {
        this.houses.set(houseId, result.snapshot);
        this.sendHouseState(session, characterId, houseId);
        session.send({
          type: "house-event",
          kind: "purchased",
          houseName: info.name,
        });
      };
    });
  }

  private abandon(session: Session, characterId: string): void {
    const houseId = this.houses.ownedBy(characterId);
    if (houseId === undefined) {
      this.fail(session, "not-owner");
      return;
    }
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result = await store.abandon({
        houseId,
        ownerCharacterId: characterId,
        mapName: this.world.mapName,
        tilePositions: this.world.getHouseTiles(houseId),
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      return (at: number) => {
        this.clearPendingTransfer(houseId);
        this.houses.set(houseId, null);
        this.applyEviction(result.evicted, at);
        this.sweepUnauthorizedOccupants(houseId, at);
        this.sendHouseState(session, characterId, houseId);
      };
    });
  }

  private offerTransfer(
    session: Session,
    characterId: string,
    player: Player,
    intent: HouseTransferOfferMessage,
  ): void {
    const houseId = this.houses.ownedBy(characterId);
    const info = houseId === undefined ? undefined : this.content.get(houseId);
    if (houseId === undefined || !info) {
      this.fail(session, "not-owner");
      return;
    }
    if (this.pendingTransfers.has(houseId)) {
      this.fail(session, "invalid-request");
      return;
    }
    const target = this.findOnlinePlayerByName(intent.targetName);
    if (!target) {
      this.fail(session, "target-offline");
      return;
    }
    if (target.id === characterId) {
      this.fail(session, "invalid-request");
      return;
    }
    if (this.houses.ownedBy(target.id) !== undefined) {
      this.fail(session, "target-has-house");
      return;
    }
    this.pendingTransfers.set(houseId, {
      fromCharacterId: characterId,
      fromName: player.name,
      targetCharacterId: target.id,
      targetName: target.name,
      price: intent.price,
    });
    this.registry.sessionFor(target.id)?.send({
      type: "house-transfer-incoming",
      houseId,
      houseName: info.name,
      fromName: player.name,
      price: intent.price,
    });
    this.sendHouseState(session, characterId, houseId);
  }

  private respondTransfer(
    session: Session,
    characterId: string,
    player: Player,
    intent: HouseTransferRespondMessage,
    now: number,
  ): void {
    const pending = this.pendingTransfers.get(intent.houseId);
    if (!pending || pending.targetCharacterId !== characterId) {
      this.fail(session, "offer-not-found");
      return;
    }
    const info = this.content.get(intent.houseId);
    if (!info) {
      this.fail(session, "not-found");
      return;
    }
    if (!intent.accept) {
      this.pendingTransfers.delete(intent.houseId);
      this.sendEventTo(pending.fromCharacterId, {
        type: "house-event",
        kind: "transfer-cancelled",
        houseName: info.name,
        detail: player.name,
      });
      return;
    }
    if (this.houses.ownedBy(characterId) !== undefined) {
      this.fail(session, "own-house-exists");
      return;
    }
    const store = this.requireStore();
    const houseId = intent.houseId;
    this.enqueue(characterId, async () => {
      const result = await store.transfer({
        houseId,
        fromCharacterId: pending.fromCharacterId,
        toCharacterId: characterId,
        price: pending.price,
        paidUntilMs: now + RENT_PERIOD_MS,
        mapName: this.world.mapName,
        tilePositions: this.world.getHouseTiles(houseId),
      });
      if (result.status === "failed") {
        return () => {
          // A stale offer (the seller lost the house meanwhile) is dropped.
          if (result.reason === "not-owner") {
            this.pendingTransfers.delete(houseId);
          }
          this.fail(session, result.reason);
        };
      }
      return (at: number) => {
        this.pendingTransfers.delete(houseId);
        this.houses.set(houseId, result.snapshot);
        this.applyEviction(result.evicted, at);
        this.sweepUnauthorizedOccupants(houseId, at);
        this.sendEventTo(pending.fromCharacterId, {
          type: "house-event",
          kind: "transferred",
          houseName: info.name,
          detail: player.name,
        });
        this.sendHouseState(session, characterId, houseId);
        session.send({
          type: "house-event",
          kind: "purchased",
          houseName: info.name,
        });
      };
    });
  }

  private cancelTransfer(session: Session, characterId: string): void {
    const houseId = this.houses.ownedBy(characterId);
    if (houseId === undefined) {
      this.fail(session, "not-owner");
      return;
    }
    const pending = this.pendingTransfers.get(houseId);
    if (!pending) {
      this.fail(session, "offer-not-found");
      return;
    }
    this.pendingTransfers.delete(houseId);
    this.sendEventTo(pending.targetCharacterId, {
      type: "house-event",
      kind: "transfer-cancelled",
      houseName: this.content.get(houseId)?.name ?? "?",
    });
    this.sendHouseState(session, characterId, houseId);
  }

  private setAccess(
    session: Session,
    characterId: string,
    intent: HouseSetAccessMessage,
  ): void {
    const houseId = this.houseManagedBy(characterId, intent.kind);
    if (houseId === undefined) {
      this.fail(session, "not-authorized");
      return;
    }
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result = await store.setAccess({
        houseId,
        actorCharacterId: characterId,
        kind: intent.kind,
        targetName: intent.targetName,
        grant: intent.grant,
        maxEntries: HOUSE_LIMITS.maxAccessEntries,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      return (at: number) => {
        this.houses.set(houseId, result.snapshot);
        if (!intent.grant) this.sweepUnauthorizedOccupants(houseId, at);
        this.sendHouseState(session, characterId, houseId);
      };
    });
  }

  private kick(
    session: Session,
    characterId: string,
    player: Player,
    intent: HouseKickMessage,
    now: number,
  ): void {
    if (intent.targetCharacterId === undefined) {
      // Self-kick: any visitor may step out to the entry of the house they
      // are standing in.
      const houseId = this.world.getHouseId(player.position);
      if (houseId === undefined) {
        this.fail(session, "invalid-request");
        return;
      }
      this.teleportToEntry(player, houseId, now);
      return;
    }
    const houseId = this.houseManagedBy(characterId, "guest");
    if (houseId === undefined) {
      this.fail(session, "not-authorized");
      return;
    }
    const target = this.world.getPlayer(intent.targetCharacterId);
    if (
      !target ||
      this.world.getHouseId(target.position) !== houseId ||
      target.id === this.houses.get(houseId)?.ownerCharacterId
    ) {
      this.fail(session, "target-not-found");
      return;
    }
    this.teleportToEntry(target, houseId, now);
  }

  /** The house this character may manage (owner always; subowner for guests). */
  private houseManagedBy(
    characterId: string,
    kind: "guest" | "subowner",
  ): number | undefined {
    const owned = this.houses.ownedBy(characterId);
    if (owned !== undefined) return owned;
    if (kind !== "guest") return undefined;
    for (const snapshot of this.houses.all()) {
      if (
        snapshot.subowners.some((entry) => entry.characterId === characterId)
      ) {
        return snapshot.houseId;
      }
    }
    return undefined;
  }

  private applyRentResult(
    houseId: number,
    info: HouseInfo,
    result: ChargeHouseRentResult,
    now: number,
  ): void {
    if (result.status === "skip") return;
    if (result.status === "paid") {
      this.houses.set(houseId, result.snapshot);
      this.sendEventTo(result.snapshot.ownerCharacterId, {
        type: "house-event",
        kind: "rent-paid",
        houseName: info.name,
      });
      return;
    }
    if (result.status === "warned") {
      this.houses.set(houseId, result.snapshot);
      this.sendEventTo(result.snapshot.ownerCharacterId, {
        type: "house-event",
        kind: "rent-warning",
        houseName: info.name,
        warningsLeft: Math.max(
          HOUSE_LIMITS.maxWarnings - result.snapshot.rentWarnings,
          0,
        ),
      });
      return;
    }
    this.clearPendingTransfer(houseId);
    this.houses.set(houseId, null);
    this.applyEviction(result.evicted, now);
    this.sweepUnauthorizedOccupants(houseId, now);
    this.sendEventTo(result.ownerCharacterId, {
      type: "house-event",
      kind: "evicted",
      houseName: info.name,
    });
  }

  /**
   * Applies a committed eviction to the live world: removes the moved roots
   * (and their subtrees) from the map, tells viewers, and injects the
   * delivered items into the recipient's online inbox cache.
   */
  private applyEviction(evicted: HouseEvictionDelivery, _now: number): void {
    const changed: Position[] = [];
    for (const removedId of evicted.removedItemIds) {
      const item = this.world.getWorldItem(removedId);
      if (!item || item.location.kind !== "world") continue;
      const subtree = this.world.getWorldSubtree(item.id);
      changed.push(
        ...this.world.applyItemMutation({
          before: item,
          after: [],
          removedItemIds: subtree.map((node) => node.id),
        }),
      );
    }
    if (changed.length > 0) this.visibility.onMapItemsChanged(changed);
    if (evicted.deliveredItems.length > 0) {
      this.depot.applyExternalCacheEvent(evicted.recipientCharacterId, {
        upserts: evicted.deliveredItems,
        bumps: [{ kind: "inbox" }],
      });
    }
  }

  /** Teleports every player left standing on the house without access. */
  private sweepUnauthorizedOccupants(houseId: number, now: number): void {
    for (const player of this.world.allPlayers()) {
      if (this.world.getHouseId(player.position) !== houseId) continue;
      if (this.houses.accessLevel(houseId, player.id) !== "none") continue;
      this.teleportToEntry(player, houseId, now);
    }
  }

  private teleportToEntry(player: Player, houseId: number, now: number): void {
    const entry = this.content.get(houseId)?.entry;
    if (!entry) return;
    const destination =
      this.world.findUnoccupiedPosition(entry, 2) ?? undefined;
    if (!destination) return;
    const session = this.registry.sessionFor(player.id);
    if (session) {
      session.movementDirection = null;
      session.bufferedMovementDirection = null;
      session.autoWalkDirections = [];
    }
    const from = this.world.relocateCreature(player, destination);
    if (session) this.visibility.onPlayerTeleported(session, player, from);
    this.persistence.saveNow(player, now);
  }

  private sendHouseState(
    session: Session,
    characterId: string,
    houseId: number,
  ): void {
    const info = this.content.get(houseId);
    if (!info) return;
    if (session.playerId !== characterId) return;
    const snapshot = this.houses.get(houseId);
    const pending =
      snapshot?.ownerCharacterId === characterId
        ? this.pendingTransfers.get(houseId)
        : undefined;
    session.send({
      type: "house-state",
      house: projectHouseStateFor({
        info,
        snapshot,
        viewerCharacterId: characterId,
        ...(this.world.townName(info.townId)
          ? { townName: this.world.townName(info.townId) }
          : {}),
        ...(pending
          ? {
              pendingTransfer: {
                targetName: pending.targetName,
                price: pending.price,
              },
            }
          : {}),
      }),
    });
  }

  private clearPendingTransfer(houseId: number): void {
    const pending = this.pendingTransfers.get(houseId);
    if (!pending) return;
    this.pendingTransfers.delete(houseId);
    this.sendEventTo(pending.targetCharacterId, {
      type: "house-event",
      kind: "transfer-cancelled",
      houseName: this.content.get(houseId)?.name ?? "?",
    });
  }

  private isAtHouse(position: Position, houseId: number): boolean {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const candidate = {
          x: position.x + dx,
          y: position.y + dy,
          z: position.z,
        };
        if (this.world.getHouseId(candidate) === houseId) return true;
      }
    }
    return false;
  }

  private findOnlinePlayerByName(name: string): Player | undefined {
    const normalized = name.trim().toLowerCase();
    for (const player of this.world.allPlayers()) {
      if (player.name.trim().toLowerCase() === normalized) return player;
    }
    return undefined;
  }

  private sendEventTo(characterId: string, event: HouseEventMessage): void {
    const session = this.registry.sessionFor(characterId);
    if (session?.playerId === characterId) session.send(event);
  }

  private loadAllFromStore(): void {
    const store = this.store;
    if (!store) {
      this.loaded = true;
      return;
    }
    const operation = store.loadAll().then(
      (snapshots) => {
        this.outcomes.push(() => {
          for (const snapshot of snapshots) {
            this.houses.set(snapshot.houseId, snapshot);
          }
          this.loaded = true;
        });
      },
      (cause: unknown) => this.warn("load-all", cause),
    );
    this.track(operation);
  }

  /**
   * Runs one store operation off-tick and applies its result through the
   * outcomes queue next tick; at most one in flight per character.
   */
  private enqueue(
    characterId: string,
    work: () => Promise<(now: number) => void>,
  ): void {
    this.opPendingByCharacter.add(characterId);
    const operation = work().then(
      (apply) => {
        this.outcomes.push((now) => {
          this.opPendingByCharacter.delete(characterId);
          apply(now);
        });
      },
      (cause: unknown) => {
        this.warn(characterId, cause);
        this.outcomes.push(() => {
          this.opPendingByCharacter.delete(characterId);
        });
      },
    );
    this.track(operation);
  }

  private failLater(
    session: Session,
    reason: HouseActionFailedReason,
  ): (now: number) => void {
    return () => this.fail(session, reason);
  }

  private fail(session: Session, reason: HouseActionFailedReason): void {
    session.send({ type: "house-action-failed", reason });
  }

  private requireStore(): HouseStore {
    const store = this.store;
    if (!store) throw new Error("house store is not configured");
    return store;
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(context: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`house operation failed (${context}): ${reason}`);
  }
}
