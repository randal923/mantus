import {
  VIP_LIMITS,
  type VipActionFailedReason,
  type VipAddMessage,
  type VipEditMessage,
  type VipEntry,
  type VipRemoveMessage,
} from "@tibia/protocol";
import { getAccountStatus } from "../getAccountStatus";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { VipEntryRecord, VipStore } from "./VipStore";

type VipIntent = VipAddMessage | VipRemoveMessage | VipEditMessage;

/**
 * Server-authoritative VIP/friends lists on durable storage. Lists are
 * private: `vip-state` goes only to the owning session and presence
 * pushes go only to online players whose own list contains the character
 * (charter rule 6), via an in-memory reverse index maintained from the
 * lists of online players. Mutations run off-tick through the store and
 * apply through the outcomes queue inside the tick (charter rules 3–5).
 */
export class VipService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly opPendingByCharacter = new Set<string>();
  private readonly entriesByCharacter = new Map<string, VipEntryRecord[]>();
  /** characterId -> online characters whose list contains it. */
  private readonly watchersByCharacter = new Map<string, Set<string>>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly store?: VipStore,
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

  /** Runs inside the tick right after the player entered the world. */
  attachCharacter(session: Session, characterId: string): void {
    // Watchers already online learn about this login immediately; their
    // notify flag is applied client-side from their own private list.
    this.pushStatus(characterId, true);
    const store = this.store;
    if (!store) return;
    this.enqueue(characterId, async () => {
      const entries = await store.loadEntries(characterId);
      return () => {
        if (this.registry.sessionFor(characterId) !== session) return;
        this.entriesByCharacter.set(characterId, [...entries]);
        for (const entry of entries) {
          this.addWatcherEdge(entry.vipCharacterId, characterId);
        }
        this.sendState(session, characterId);
      };
    });
  }

  /** Runs inside the tick before the player leaves the world. */
  detachCharacter(characterId: string): void {
    this.pushStatus(characterId, false);
    const entries = this.entriesByCharacter.get(characterId);
    if (entries) {
      for (const entry of entries) {
        this.removeWatcherEdge(entry.vipCharacterId, characterId);
      }
    }
    this.entriesByCharacter.delete(characterId);
    this.opPendingByCharacter.delete(characterId);
  }

  handle(session: Session, intent: VipIntent, now: number): void {
    const characterId = session.playerId;
    if (!characterId || !this.world.getPlayer(characterId)) {
      session.sendError("join-required");
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
    this.cooldownBySession.set(session.id, now + VIP_LIMITS.actionCooldownMs);
    switch (intent.type) {
      case "vip-add":
        this.add(session, characterId, intent.name, now);
        return;
      case "vip-remove":
        this.remove(session, characterId, intent.targetCharacterId);
        return;
      case "vip-edit":
        this.edit(session, characterId, intent);
        return;
    }
  }

  private add(
    session: Session,
    characterId: string,
    name: string,
    now: number,
  ): void {
    const store = this.requireStore();
    const maxEntries =
      session.account &&
      getAccountStatus(session.account, now).accountTier === "premium"
        ? VIP_LIMITS.maxEntries
        : VIP_LIMITS.freeMaxEntries;
    if ((this.entriesByCharacter.get(characterId)?.length ?? 0) >= maxEntries) {
      this.fail(session, "list-full");
      return;
    }
    this.enqueue(characterId, async () => {
      const result = await store.addVip({
        characterId,
        targetName: name,
        maxEntries,
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      return () => {
        if (this.registry.sessionFor(characterId) !== session) return;
        const entries = this.entriesByCharacter.get(characterId) ?? [];
        entries.push(result.entry);
        entries.sort((a, b) => a.name.localeCompare(b.name));
        this.entriesByCharacter.set(characterId, entries);
        this.addWatcherEdge(result.entry.vipCharacterId, characterId);
        this.sendState(session, characterId);
      };
    });
  }

  private remove(
    session: Session,
    characterId: string,
    vipCharacterId: string,
  ): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result = await store.removeVip({ characterId, vipCharacterId });
      if (result.status === "failed") return this.failLater(session, result.reason);
      return () => {
        if (this.registry.sessionFor(characterId) !== session) return;
        const entries = (this.entriesByCharacter.get(characterId) ?? []).filter(
          (entry) => entry.vipCharacterId !== vipCharacterId,
        );
        this.entriesByCharacter.set(characterId, entries);
        this.removeWatcherEdge(vipCharacterId, characterId);
        this.sendState(session, characterId);
      };
    });
  }

  private edit(
    session: Session,
    characterId: string,
    intent: VipEditMessage,
  ): void {
    const store = this.requireStore();
    this.enqueue(characterId, async () => {
      const result = await store.editVip({
        characterId,
        vipCharacterId: intent.targetCharacterId,
        ...(intent.description !== undefined
          ? { description: intent.description }
          : {}),
        ...(intent.icon !== undefined ? { icon: intent.icon } : {}),
        ...(intent.notifyLogin !== undefined
          ? { notifyLogin: intent.notifyLogin }
          : {}),
      });
      if (result.status === "failed") return this.failLater(session, result.reason);
      return () => {
        if (this.registry.sessionFor(characterId) !== session) return;
        const entries = (this.entriesByCharacter.get(characterId) ?? []).map(
          (entry) =>
            entry.vipCharacterId === intent.targetCharacterId
              ? {
                  ...entry,
                  description: intent.description ?? entry.description,
                  icon: intent.icon ?? entry.icon,
                  notifyLogin: intent.notifyLogin ?? entry.notifyLogin,
                }
              : entry,
        );
        this.entriesByCharacter.set(characterId, entries);
        this.sendState(session, characterId);
      };
    });
  }

  /** Presence push to exactly the online watchers of this character. */
  private pushStatus(characterId: string, online: boolean): void {
    const watchers = this.watchersByCharacter.get(characterId);
    if (!watchers) return;
    for (const watcherId of watchers) {
      const session = this.registry.sessionFor(watcherId);
      if (session?.playerId !== watcherId) continue;
      session.send({ type: "vip-status-changed", characterId, online });
    }
  }

  private sendState(session: Session, characterId: string): void {
    const entries: VipEntry[] = (
      this.entriesByCharacter.get(characterId) ?? []
    ).map((entry) => ({
      characterId: entry.vipCharacterId,
      name: entry.name,
      level: entry.level,
      vocation: entry.vocation,
      online: this.isOnline(entry.vipCharacterId),
      description: entry.description,
      icon: entry.icon,
      notifyLogin: entry.notifyLogin,
    }));
    session.send({ type: "vip-state", entries });
  }

  private isOnline(characterId: string): boolean {
    return this.registry.sessionFor(characterId)?.playerId === characterId;
  }

  private addWatcherEdge(targetId: string, watcherId: string): void {
    const watchers = this.watchersByCharacter.get(targetId) ?? new Set<string>();
    watchers.add(watcherId);
    this.watchersByCharacter.set(targetId, watchers);
  }

  private removeWatcherEdge(targetId: string, watcherId: string): void {
    const watchers = this.watchersByCharacter.get(targetId);
    if (!watchers) return;
    watchers.delete(watcherId);
    if (watchers.size === 0) this.watchersByCharacter.delete(targetId);
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
        this.warn(characterId, cause);
        this.outcomes.push(() => {
          this.opPendingByCharacter.delete(characterId);
        });
      },
    );
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private failLater(
    session: Session,
    reason: VipActionFailedReason,
  ): (now: number) => void {
    return () => this.fail(session, reason);
  }

  private fail(session: Session, reason: VipActionFailedReason): void {
    session.send({ type: "vip-action-failed", reason });
  }

  private requireStore(): VipStore {
    const store = this.store;
    if (!store) throw new Error("vip store is not configured");
    return store;
  }

  private warn(context: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`vip operation failed (${context}): ${reason}`);
  }
}
