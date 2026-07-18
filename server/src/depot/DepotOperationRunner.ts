import { DEPOT_LIMITS, type DepotLocation } from "@tibia/protocol";
import { normalizeCharacterName } from "../character/normalizeCharacterName";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { DepotAccessTracker } from "./DepotAccessTracker";
import type { DepotIntent } from "./DepotIntent";
import type {
  DepotStore,
  DepotTransferResult,
  StashTransferResult,
} from "./DepotStore";
import { failDepot } from "./failDepot";
import { failMail } from "./failMail";
import { projectDepotState } from "./projectDepotState";
import type { StorageAccess } from "./StorageAccess";

export class DepotOperationRunner {
  private readonly outcomes: Array<() => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();

  constructor(
    private readonly items: ItemIntentHandler,
    private readonly tracker: DepotAccessTracker,
    private readonly store?: DepotStore,
  ) {}

  applyResolvedOutcomes(): void {
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  beginBrowse(
    session: Session,
    access: Extract<StorageAccess, { kind: "depot" }>,
    location: DepotLocation,
    page: number,
    query: string,
  ): void {
    if (!this.store || !session.playerId) {
      failDepot(session, "failed");
      return;
    }
    if (session.depotOperationPending) {
      failDepot(session, "busy");
      return;
    }
    if (!this.tracker.isAccessCurrent(session, access)) {
      this.tracker.closeOutOfRange(session, "depot");
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
          if (!this.tracker.isAccessCurrent(session, access)) {
            this.tracker.closeOutOfRange(session, "depot");
            return;
          }
          session.send(
            projectDepotState(this.items, access, location, query, page, result),
          );
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`depot browse failed for ${session.playerId}: ${reason}`);
        this.outcomes.push(() => {
          session.depotOperationPending = false;
          failDepot(session, "failed");
        });
      });
    this.track(resolution);
  }

  beginDepotMutation(
    session: Session,
    access: Extract<StorageAccess, { kind: "depot" }>,
    refreshLocation: "depot" | "inbox",
    operation: Promise<DepotTransferResult>,
  ): void {
    const characterId = session.playerId;
    if (!characterId) {
      failDepot(session, "failed");
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
            if (!this.tracker.isAccessCurrent(session, access)) {
              this.tracker.closeOutOfRange(session, "depot");
              return;
            }
            failDepot(session, result.status);
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
          if (!this.tracker.isAccessCurrent(session, access)) {
            this.tracker.closeOutOfRange(session, "depot");
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
          failDepot(session, "failed");
        });
      });
    this.items.trackExternalOperation(characterId, resolution);
    this.track(resolution);
  }

  beginStashMutation(
    session: Session,
    access: Extract<StorageAccess, { kind: "depot" }>,
    operation: Promise<StashTransferResult>,
  ): void {
    const characterId = session.playerId;
    if (!characterId) {
      failDepot(session, "failed");
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
            if (!this.tracker.isAccessCurrent(session, access)) {
              this.tracker.closeOutOfRange(session, "depot");
              return;
            }
            failDepot(session, result.status);
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
          if (!this.tracker.isAccessCurrent(session, access)) {
            this.tracker.closeOutOfRange(session, "depot");
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
          failDepot(session, "failed");
        });
      });
    this.items.trackExternalOperation(characterId, resolution);
    this.track(resolution);
  }

  handleSendMail(
    session: Session,
    intent: Extract<DepotIntent, { type: "send-mail" }>,
  ): void {
    const access = this.tracker.get(session);
    if (
      !this.store ||
      !session.playerId ||
      !access ||
      access.kind !== "mailbox" ||
      access.sessionId !== intent.sessionId
    ) {
      failMail(session, "out-of-range");
      return;
    }
    if (!this.tracker.isAccessCurrent(session, access)) {
      this.tracker.closeOutOfRange(session, "mailbox");
      return;
    }
    if (session.itemOperationPending || session.depotOperationPending) {
      failMail(session, "busy");
      return;
    }
    const recipient = normalizeCharacterName(intent.recipientName);
    if (!recipient) {
      failMail(session, "recipient-not-found");
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
            if (!this.tracker.isAccessCurrent(session, access)) {
              this.tracker.closeOutOfRange(session, "mailbox");
              return;
            }
            failMail(session, result.status);
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
          if (!this.tracker.isAccessCurrent(session, access)) {
            this.tracker.closeOutOfRange(session, "mailbox");
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
          failMail(session, "failed");
        });
      });
    this.items.trackExternalOperation(characterId, resolution);
    this.track(resolution);
  }

  track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }
}
