import { randomUUID } from "node:crypto";
import {
  DEPOT_LIMITS,
  type ClientMessage,
  type DepotActionFailedReason,
  type DepotEntry,
  type DepotLocation,
  type DepotStateMessage,
  type MailActionFailedReason,
  type Position,
} from "@tibia/protocol";
import { normalizeCharacterName } from "../character/normalizeCharacterName";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { World } from "../World";
import type {
  DepotPage,
  DepotStore,
  DepotTransferResult,
  RewardDeliveryRequest,
  SendMailResult,
  StashTransferResult,
} from "./DepotStore";

type DepotIntent = Extract<
  ClientMessage,
  {
    type:
      | "depot-deposit"
      | "depot-withdraw"
      | "depot-browse"
      | "stash-deposit"
      | "stash-withdraw"
      | "close-depot"
      | "send-mail"
      | "close-mailbox";
  }
>;

type StorageAccess =
  | {
      readonly kind: "depot";
      readonly sessionId: string;
      readonly position: Position;
      readonly depotId: number;
      readonly townName: string;
    }
  | {
      readonly kind: "mailbox";
      readonly sessionId: string;
      readonly position: Position;
    };

const EXPIRY_SCAN_INTERVAL_MS = 60_000;

function isNear(left: Position, right: Position): boolean {
  return (
    left.z === right.z &&
    Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) <= 1
  );
}

export class DepotService {
  private readonly accessBySession = new Map<string, StorageAccess>();
  private readonly outcomes: Array<() => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private expirationOperation: Promise<void> | null = null;
  private nextExpiryScanAt = 0;

  constructor(
    private readonly world: World,
    private readonly items: ItemIntentHandler,
    private readonly store?: DepotStore,
  ) {}

  handleMapUse(session: Session, position: Position): boolean {
    const mapItems = this.world.getMapItems(position);
    const depotItem = mapItems.find((item) => {
      const depotId = item.source?.attributes.depotId;
      return (
        Number.isInteger(depotId) &&
        Number(depotId) >= 1 &&
        Number(depotId) <= 65_535
      );
    });
    if (depotItem) {
      const depotId = Number(depotItem.source?.attributes.depotId);
      if (!this.canReach(session, position)) {
        this.failDepot(session, "out-of-range");
        return true;
      }
      if (!this.store) {
        this.failDepot(session, "failed");
        return true;
      }
      const access: StorageAccess = {
        kind: "depot",
        sessionId: randomUUID(),
        position: { ...position },
        depotId,
        townName: this.world.townName(depotId) ?? `Depot ${depotId}`,
      };
      this.accessBySession.set(session.id, access);
      this.beginBrowse(session, access, "depot", 1, "");
      return true;
    }
    const mailbox = mapItems.some(
      (item) => this.items.itemType(item.itemId)?.kind === "mailbox",
    );
    if (!mailbox) return false;
    if (!this.canReach(session, position)) {
      this.failMail(session, "out-of-range");
      return true;
    }
    if (!this.store) {
      this.failMail(session, "failed");
      return true;
    }
    const access: StorageAccess = {
      kind: "mailbox",
      sessionId: randomUUID(),
      position: { ...position },
    };
    this.accessBySession.set(session.id, access);
    session.send({ type: "mailbox-opened", sessionId: access.sessionId });
    return true;
  }

  handle(session: Session, intent: DepotIntent): void {
    if (intent.type === "close-depot" || intent.type === "close-mailbox") {
      const access = this.accessBySession.get(session.id);
      if (access?.sessionId === intent.sessionId) {
        this.accessBySession.delete(session.id);
      }
      return;
    }
    if (intent.type === "send-mail") {
      this.handleSendMail(session, intent);
      return;
    }
    const access = this.requireDepotAccess(session, intent.sessionId);
    if (!access) return;
    if (intent.type === "depot-browse") {
      this.beginBrowse(
        session,
        access,
        intent.location,
        intent.page,
        intent.query,
      );
      return;
    }
    const snapshot = session.playerId
      ? this.items.inventorySnapshot(session.playerId)
      : null;
    if (!session.playerId || !snapshot || !this.store) {
      this.failDepot(session, "failed");
      return;
    }
    if (session.itemOperationPending || session.depotOperationPending) {
      this.failDepot(session, "busy");
      return;
    }
    if (intent.type === "depot-deposit") {
      this.beginDepotMutation(
        session,
        access,
        "depot",
        this.store.deposit(
          session.playerId,
          access.depotId,
          intent.depotRevision,
          intent.itemId,
          intent.itemRevision,
        ),
      );
      return;
    }
    if (intent.type === "depot-withdraw") {
      this.beginDepotMutation(
        session,
        access,
        intent.source,
        this.store.withdraw(
          session.playerId,
          access.depotId,
          intent.source,
          intent.sourceRevision,
          intent.itemId,
          intent.itemRevision,
          snapshot.capacityMax,
        ),
      );
      return;
    }
    if (intent.type === "stash-deposit") {
      this.beginStashMutation(
        session,
        access,
        this.store.depositStash(
          session.playerId,
          access.depotId,
          intent.stashRevision,
          intent.itemId,
          intent.itemRevision,
          intent.count,
        ),
      );
      return;
    }
    this.beginStashMutation(
      session,
      access,
      this.store.withdrawStash(
        session.playerId,
        access.depotId,
        intent.stashRevision,
        intent.itemTypeId,
        intent.count,
        snapshot.capacityMax,
      ),
    );
  }

  applyResolvedOutcomes(): void {
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  tick(now: number): void {
    if (
      !this.store ||
      this.expirationOperation ||
      now < this.nextExpiryScanAt
    ) {
      return;
    }
    this.nextExpiryScanAt = now + EXPIRY_SCAN_INTERVAL_MS;
    const operation = this.store
      .returnExpired(new Date(now), 25)
      .then(() => undefined)
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`inbox expiry scan failed: ${reason}`);
      })
      .finally(() => {
        this.expirationOperation = null;
      });
    this.expirationOperation = operation;
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  detach(session: Session): void {
    this.accessBySession.delete(session.id);
  }

  deliverReward(request: RewardDeliveryRequest) {
    if (!this.store) throw new Error("depot store is unavailable");
    return this.store.deliverReward(request);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  private beginBrowse(
    session: Session,
    access: Extract<StorageAccess, { kind: "depot" }>,
    location: DepotLocation,
    page: number,
    query: string,
  ): void {
    if (!this.store || !session.playerId) {
      this.failDepot(session, "failed");
      return;
    }
    if (session.depotOperationPending) {
      this.failDepot(session, "busy");
      return;
    }
    if (!this.isAccessCurrent(session, access)) {
      this.closeOutOfRange(session, "depot");
      return;
    }
    session.depotOperationPending = true;
    const matchingItemTypeIds =
      query.length === 0
        ? null
        : this.items.itemTypesByName(query).map((type) => type.id);
    const operation = this.store.browse(
      session.playerId,
      access.depotId,
      location,
      page,
      matchingItemTypeIds,
    );
    const resolution = operation
      .then((result) => {
        this.outcomes.push(() => {
          session.depotOperationPending = false;
          if (!this.isAccessCurrent(session, access)) {
            this.closeOutOfRange(session, "depot");
            return;
          }
          session.send(this.projectState(access, location, query, page, result));
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`depot browse failed for ${session.playerId}: ${reason}`);
        this.outcomes.push(() => {
          session.depotOperationPending = false;
          this.failDepot(session, "failed");
        });
      });
    this.track(resolution);
  }

  private beginDepotMutation(
    session: Session,
    access: Extract<StorageAccess, { kind: "depot" }>,
    refreshLocation: "depot" | "inbox",
    operation: Promise<DepotTransferResult>,
  ): void {
    const characterId = session.playerId;
    if (!characterId) {
      this.failDepot(session, "failed");
      return;
    }
    session.itemOperationPending = true;
    session.depotOperationPending = true;
    const resolution = operation
      .then((result) => {
        this.outcomes.push(() => {
          session.itemOperationPending = false;
          session.depotOperationPending = false;
          if (result.status !== "committed") {
            if (!this.isAccessCurrent(session, access)) {
              this.closeOutOfRange(session, "depot");
              return;
            }
            this.failDepot(session, result.status);
            if (result.status === "stale") {
              this.beginBrowse(session, access, refreshLocation, 1, "");
            }
            return;
          }
          this.items.applyCommittedMutation(
            session,
            characterId,
            result.mutation,
            Date.now(),
          );
          if (!this.isAccessCurrent(session, access)) {
            this.closeOutOfRange(session, "depot");
            return;
          }
          this.beginBrowse(session, access, refreshLocation, 1, "");
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`depot transfer failed for ${characterId}: ${reason}`);
        this.outcomes.push(() => {
          session.itemOperationPending = false;
          session.depotOperationPending = false;
          this.failDepot(session, "failed");
        });
      });
    this.items.trackExternalOperation(characterId, resolution);
    this.track(resolution);
  }

  private beginStashMutation(
    session: Session,
    access: Extract<StorageAccess, { kind: "depot" }>,
    operation: Promise<StashTransferResult>,
  ): void {
    const characterId = session.playerId;
    if (!characterId) {
      this.failDepot(session, "failed");
      return;
    }
    session.itemOperationPending = true;
    session.depotOperationPending = true;
    const resolution = operation
      .then((result) => {
        this.outcomes.push(() => {
          session.itemOperationPending = false;
          session.depotOperationPending = false;
          if (result.status !== "committed") {
            if (!this.isAccessCurrent(session, access)) {
              this.closeOutOfRange(session, "depot");
              return;
            }
            this.failDepot(session, result.status);
            if (result.status === "stale") {
              this.beginBrowse(session, access, "stash", 1, "");
            }
            return;
          }
          this.items.applyCommittedMutation(
            session,
            characterId,
            result.mutation,
            Date.now(),
          );
          if (!this.isAccessCurrent(session, access)) {
            this.closeOutOfRange(session, "depot");
            return;
          }
          this.beginBrowse(session, access, "stash", 1, "");
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`stash transfer failed for ${characterId}: ${reason}`);
        this.outcomes.push(() => {
          session.itemOperationPending = false;
          session.depotOperationPending = false;
          this.failDepot(session, "failed");
        });
      });
    this.items.trackExternalOperation(characterId, resolution);
    this.track(resolution);
  }

  private handleSendMail(
    session: Session,
    intent: Extract<DepotIntent, { type: "send-mail" }>,
  ): void {
    const access = this.accessBySession.get(session.id);
    if (
      !this.store ||
      !session.playerId ||
      !access ||
      access.kind !== "mailbox" ||
      access.sessionId !== intent.sessionId
    ) {
      this.failMail(session, "out-of-range");
      return;
    }
    if (!this.isAccessCurrent(session, access)) {
      this.closeOutOfRange(session, "mailbox");
      return;
    }
    if (session.itemOperationPending || session.depotOperationPending) {
      this.failMail(session, "busy");
      return;
    }
    const recipient = normalizeCharacterName(intent.recipientName);
    if (!recipient) {
      this.failMail(session, "recipient-not-found");
      return;
    }
    const characterId = session.playerId;
    const expiresAt = new Date(
      Date.now() + DEPOT_LIMITS.mailExpiryDays * 24 * 60 * 60 * 1_000,
    );
    session.itemOperationPending = true;
    session.depotOperationPending = true;
    const operation = this.store.sendMail({
      deliveryKey: `mail:${characterId}:${intent.requestId}`,
      senderCharacterId: characterId,
      itemId: intent.itemId,
      itemRevision: intent.itemRevision,
      normalizedRecipientName: recipient.normalizedName,
      expiresAt,
    });
    const resolution = operation
      .then((result) => {
        this.outcomes.push(() => {
          session.itemOperationPending = false;
          session.depotOperationPending = false;
          if (result.status !== "committed") {
            if (!this.isAccessCurrent(session, access)) {
              this.closeOutOfRange(session, "mailbox");
              return;
            }
            this.failMail(session, result.status);
            return;
          }
          if (!result.idempotent) {
            this.items.applyCommittedMutation(
              session,
              characterId,
              result.mutation,
              Date.now(),
            );
          }
          if (!this.isAccessCurrent(session, access)) {
            this.closeOutOfRange(session, "mailbox");
            return;
          }
          session.send({
            type: "mail-sent",
            requestId: intent.requestId,
            recipientName: result.recipientName,
          });
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`mail delivery failed for ${characterId}: ${reason}`);
        this.outcomes.push(() => {
          session.itemOperationPending = false;
          session.depotOperationPending = false;
          this.failMail(session, "failed");
        });
      });
    this.items.trackExternalOperation(characterId, resolution);
    this.track(resolution);
  }

  private requireDepotAccess(
    session: Session,
    sessionId: string,
  ): Extract<StorageAccess, { kind: "depot" }> | null {
    const access = this.accessBySession.get(session.id);
    if (
      !access ||
      access.kind !== "depot" ||
      access.sessionId !== sessionId ||
      !this.isAccessCurrent(session, access)
    ) {
      this.closeOutOfRange(session, "depot");
      return null;
    }
    return access;
  }

  private isAccessCurrent(session: Session, access: StorageAccess): boolean {
    const current = this.accessBySession.get(session.id);
    if (
      !session.playerId ||
      current?.sessionId !== access.sessionId ||
      !this.canReach(session, access.position)
    ) {
      return false;
    }
    const items = this.world.getMapItems(access.position);
    if (access.kind === "mailbox") {
      return items.some(
        (item) => this.items.itemType(item.itemId)?.kind === "mailbox",
      );
    }
    return items.some(
      (item) => Number(item.source?.attributes.depotId) === access.depotId,
    );
  }

  private canReach(session: Session, position: Position): boolean {
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    return Boolean(
      player &&
        isNear(player.position, position) &&
        this.world.canSee(player.position, position, session.viewRange) &&
        this.world.hasLineOfSight(player.position, position),
    );
  }

  private projectState(
    access: Extract<StorageAccess, { kind: "depot" }>,
    location: DepotLocation,
    query: string,
    page: number,
    result: DepotPage,
  ): DepotStateMessage {
    const entries: DepotEntry[] = result.entries.map((entry) => {
      const type = this.items.itemType(
        entry.location === "stash" ? entry.itemTypeId : entry.item.typeId,
      );
      if (!type) throw new Error("depot contains an unknown item type");
      if (entry.location === "stash") {
        return {
          location: "stash",
          itemTypeId: type.id,
          clientId: type.clientId,
          spriteId: type.spriteId,
          name: type.name,
          stackable: type.stackable,
          maxCount: type.maxCount,
          weight: type.weight,
          ...(type.stowable ? { stowable: true } : {}),
          count: entry.count,
        };
      }
      return {
        location: entry.location,
        slot: entry.slot,
        itemId: entry.item.id,
        itemTypeId: type.id,
        clientId: type.clientId,
        spriteId: type.spriteId,
        name: type.name,
        stackable: type.stackable,
        maxCount: type.maxCount,
        weight: type.weight,
        ...(type.stowable &&
        type.containerCapacity === undefined &&
        Object.keys(entry.item.attributes).length === 0
          ? { stowable: true }
          : {}),
        count: entry.item.count,
        revision: entry.item.version,
        containedItemCount: entry.containedItemCount,
      };
    });
    return {
      type: "depot-state",
      sessionId: access.sessionId,
      depotId: access.depotId,
      townName: access.townName,
      depotRevision: result.snapshot.depotRevision,
      inboxRevision: result.snapshot.inboxRevision,
      stashRevision: result.snapshot.stashRevision,
      depotCount: result.snapshot.depotCount,
      inboxCount: result.snapshot.inboxCount,
      stashCount: result.snapshot.stashCount,
      depotCapacity: DEPOT_LIMITS.maxDepotItems,
      inboxCapacity: DEPOT_LIMITS.maxInboxItems,
      location,
      query,
      page,
      pageCount: Math.max(
        1,
        Math.ceil(result.totalEntries / DEPOT_LIMITS.pageSize),
      ),
      entries,
    };
  }

  private closeOutOfRange(
    session: Session,
    kind: "depot" | "mailbox",
  ): void {
    this.accessBySession.delete(session.id);
    if (kind === "depot") {
      this.failDepot(session, "out-of-range");
      return;
    }
    this.failMail(session, "out-of-range");
  }

  private failDepot(session: Session, reason: DepotActionFailedReason): void {
    session.send({ type: "depot-action-failed", reason });
  }

  private failMail(session: Session, reason: MailActionFailedReason): void {
    session.send({ type: "mail-action-failed", reason });
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }
}
