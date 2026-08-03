import {
  VIP_LIMITS,
  type FriendEntry,
  type FriendRemoveMessage,
  type FriendRequestMessage,
  type FriendRespondMessage,
  type SocialSetSettingsMessage,
  type VipActionFailedReason,
} from "@tibia/protocol";
import { LoginLoadQueue } from "../character/LoginLoadQueue";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { FriendRecord, FriendSnapshot, FriendStore } from "./FriendStore";
import { ResolvedOutcomes } from "../ResolvedOutcomes";

type FriendIntent =
  | FriendRequestMessage
  | FriendRespondMessage
  | FriendRemoveMessage
  | SocialSetSettingsMessage;

/**
 * Reciprocal friendships on durable storage. Unlike the one-way VIP list, a
 * friendship needs both sides to agree, so every mutation is a store
 * transaction and the other party is re-projected from *their* own snapshot —
 * a session never receives anyone else's list (charter rule 6).
 *
 * `finderVisible` lives here because it is the same per-character privacy
 * record; the party finder reads it synchronously at query time through
 * `isFinderVisible`, so flipping the switch takes effect on the next query
 * rather than on relogin.
 */
export class FriendService {
  private readonly outcomes = new ResolvedOutcomes<[number]>();
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly opPendingByCharacter = new Set<string>();
  private readonly snapshots = new Map<string, FriendSnapshot>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly store?: FriendStore,
    private readonly loginLoads: LoginLoadQueue = new LoginLoadQueue(),
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

  /** Runs inside the tick right after the player entered the world. */
  attachCharacter(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) return;
    this.enqueue(characterId, async () => {
      const snapshot = await this.loginLoads.run(characterId, () =>
        store.loadSnapshot(characterId),
      );
      return () => {
        if (this.registry.sessionFor(characterId) !== session) return;
        this.snapshots.set(characterId, snapshot);
        this.sendState(session, characterId);
      };
    });
  }

  /** Runs inside the tick before the player leaves the world. */
  detachCharacter(characterId: string): void {
    this.snapshots.delete(characterId);
    this.opPendingByCharacter.delete(characterId);
  }

  /**
   * Party-finder visibility, read at query time. An offline character has no
   * cached record, so they default to visible exactly as the store does.
   */
  isFinderVisible(characterId: string): boolean {
    return this.snapshots.get(characterId)?.finderVisible ?? true;
  }

  handle(session: Session, intent: FriendIntent, now: number): void {
    const characterId = session.playerId;
    if (!characterId || !this.world.getPlayer(characterId)) {
      session.sendError("join-required");
      return;
    }
    const store = this.store;
    if (!store) {
      this.fail(session, "invalid-request");
      return;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt || this.opPendingByCharacter.has(characterId)) {
      this.fail(session, "rate-limited");
      return;
    }
    this.cooldownBySession.set(session.id, now + VIP_LIMITS.actionCooldownMs);
    this.enqueue(characterId, async () => {
      const result = await this.run(store, characterId, intent);
      if (result.status === "failed") {
        return () => this.fail(session, result.reason);
      }
      return () => {
        if (this.registry.sessionFor(characterId) !== session) return;
        this.snapshots.set(characterId, result.snapshot);
        this.sendState(session, characterId);
        if (result.notify) this.refresh(result.notify);
      };
    });
  }

  private run(
    store: FriendStore,
    characterId: string,
    intent: FriendIntent,
  ) {
    switch (intent.type) {
      case "friend-request":
        return store.request({
          characterId,
          targetName: intent.name,
          maxRequests: VIP_LIMITS.maxFriendRequests,
          maxFriends: VIP_LIMITS.maxFriends,
        });
      case "friend-respond":
        return store.respond({
          characterId,
          fromCharacterId: intent.fromCharacterId,
          accept: intent.accept,
          maxFriends: VIP_LIMITS.maxFriends,
        });
      case "friend-remove":
        return store.remove({
          characterId,
          targetCharacterId: intent.targetCharacterId,
        });
      case "social-set-settings":
        return store.setFinderVisible({
          characterId,
          finderVisible: intent.finderVisible,
        });
    }
  }

  /** Re-reads the other party's own snapshot and pushes it to them. */
  private refresh(other: FriendRecord): void {
    const store = this.store;
    const session = this.registry.sessionFor(other.characterId);
    if (!store || session?.playerId !== other.characterId) return;
    this.enqueue(other.characterId, async () => {
      const snapshot = await store.loadSnapshot(other.characterId);
      return () => {
        if (this.registry.sessionFor(other.characterId) !== session) return;
        this.snapshots.set(other.characterId, snapshot);
        this.sendState(session, other.characterId);
      };
    });
  }

  private sendState(session: Session, characterId: string): void {
    const snapshot = this.snapshots.get(characterId);
    if (!snapshot) return;
    const entries = (records: ReadonlyArray<FriendRecord>): FriendEntry[] =>
      records.map((record) => ({
        characterId: record.characterId,
        name: record.name,
        online: this.isOnline(record.characterId),
      }));
    session.send({
      type: "friend-state",
      // Presence rides only on accepted friendships: a pending request must
      // not reveal whether the other side is online.
      friends: entries(snapshot.friends),
      incoming: snapshot.incoming.map((record) => ({
        characterId: record.characterId,
        name: record.name,
        online: false,
      })),
      outgoing: snapshot.outgoing.map((record) => ({
        characterId: record.characterId,
        name: record.name,
        online: false,
      })),
      finderVisible: snapshot.finderVisible,
    });
  }

  private isOnline(characterId: string): boolean {
    return this.registry.sessionFor(characterId)?.playerId === characterId;
  }

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
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`friend operation failed (${characterId}): ${reason}`);
        this.outcomes.push(() => {
          this.opPendingByCharacter.delete(characterId);
        });
      },
    );
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private fail(session: Session, reason: VipActionFailedReason): void {
    session.send({ type: "vip-action-failed", reason });
  }
}
