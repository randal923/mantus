import { DEPOT_LIMITS } from "@tibia/protocol";
import { normalizeCharacterName } from "../character/normalizeCharacterName";
import type { Item } from "../item/Item";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { DepotAccessTracker } from "./DepotAccessTracker";
import type { DepotCacheManager } from "./DepotCacheManager";
import type { DepotIntent } from "./DepotIntent";
import type { DepotPersistPlan } from "./DepotPersistPlan";
import type { DepotStore } from "./DepotStore";
import { failMail } from "./failMail";

interface PersistQueueState {
  chain: Promise<void>;
  depth: number;
  poisoned: boolean;
}

/**
 * Owns every async edge of the depot system: the per-character FIFO of persist
 * transactions behind the in-memory mutations, mail delivery, and the
 * tick-outcome queue that applies async results to game state.
 */
export class DepotOperationRunner {
  private readonly outcomes: Array<() => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly persistQueues = new Map<string, PersistQueueState>();

  constructor(
    private readonly items: ItemIntentHandler,
    private readonly tracker: DepotAccessTracker,
    private readonly caches: DepotCacheManager,
    private readonly store?: DepotStore,
  ) {}

  applyResolvedOutcomes(): void {
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  pushOutcome(outcome: () => void): void {
    this.outcomes.push(outcome);
  }

  isPersistPoisoned(characterId: string): boolean {
    return this.persistQueues.get(characterId)?.poisoned ?? false;
  }

  clearPersistState(characterId: string): void {
    this.persistQueues.delete(characterId);
  }

  /**
   * Queues the DB write behind an already-applied memory mutation. Writes for
   * one character run strictly in order; a failed write poisons the queue,
   * skips the rest, and disconnects the session so the next login reloads
   * authoritative state from the DB.
   */
  enqueuePersist(
    session: Session,
    characterId: string,
    plan: DepotPersistPlan,
  ): void {
    const store = this.store;
    if (!store) return;
    const state = this.persistQueues.get(characterId) ?? {
      chain: Promise.resolve(),
      depth: 0,
      poisoned: false,
    };
    this.persistQueues.set(characterId, state);
    state.depth += 1;
    session.depotPersistsPending += 1;
    state.chain = state.chain
      .then(async () => {
        if (state.poisoned) return;
        await store.persist(plan);
      })
      .then(
        () => {
          this.outcomes.push(() => this.finishPersist(session, characterId, state));
        },
        (cause: unknown) => {
          state.poisoned = true;
          const reason = cause instanceof Error ? cause.message : "unknown";
          this.outcomes.push(() => {
            this.finishPersist(session, characterId, state);
            console.error(
              `depot persist failed for ${characterId}: ${reason}; disconnecting to resync from DB`,
            );
            session.terminate();
          });
        },
      );
    this.items.trackExternalOperation(characterId, state.chain);
    this.track(state.chain);
  }

  private finishPersist(
    session: Session,
    characterId: string,
    state: PersistQueueState,
  ): void {
    state.depth -= 1;
    session.depotPersistsPending = Math.max(
      0,
      session.depotPersistsPending - 1,
    );
    if (
      state.depth === 0 &&
      !state.poisoned &&
      this.persistQueues.get(characterId) === state
    ) {
      this.persistQueues.delete(characterId);
    }
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
    if (
      session.itemOperationPending ||
      session.depotOperationPending ||
      session.depotPersistsPending > 0
    ) {
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
            this.caches.applyExternal(result.recipientCharacterId, {
              upserts: result.deliveredItems,
              bumps: [{ kind: "inbox" }],
            });
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

  trackRewardInjection(
    recipientCharacterId: string,
    operation: Promise<{ item: Item | null; idempotent: boolean }>,
  ): void {
    const resolution = operation
      .then((result) => {
        if (result.idempotent || !result.item) return;
        const item = result.item;
        this.outcomes.push(() => {
          this.caches.applyExternal(recipientCharacterId, {
            upserts: [item],
            bumps: [{ kind: "inbox" }],
          });
        });
      })
      .catch(() => undefined);
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
