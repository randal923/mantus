import type { Player } from "../Player";
import type { CharacterSaveSnapshot } from "./Character";
import type { CharacterStore } from "./CharacterStore";
import { isTransientDatabaseError } from "./isTransientDatabaseError";
import { monotonicNow } from "../monotonicNow";

interface SaveState {
  player: Player;
  nextExpectedVersion: number;
  dirty: boolean;
  online: boolean;
  pendingCount: number;
  failed: unknown | null;
  tail: Promise<void>;
  lastQueuedAt: number;
  nextProgressionEventIndex: number;
  externalMutationPending: boolean;
  externalMutationCompletion: Promise<void> | null;
  settleExternalMutation: (() => void) | null;
  discardOnUntrack: boolean;
  /**
   * Fingerprints of the skills/storage rows as last handed to the store.
   * Saves are serialized per character and a failed save poisons the whole
   * chain, so "same as last enqueued" always means "same as persisted".
   */
  lastSkillsFingerprint: string;
  lastStorageFingerprint: string;
}

interface BeginExternalMutationOptions {
  readonly flushDirty?: boolean;
}

const MAX_INTERVAL_SNAPSHOTS_PER_TICK = 8;

export class CharacterPersistence {
  private readonly states = new Map<string, SaveState>();
  private readonly dirtyStates = new Set<SaveState>();
  private nextIntervalScanAt = Number.POSITIVE_INFINITY;

  constructor(
    private readonly store: CharacterStore,
    private readonly saveIntervalMs: number,
    private readonly maxRetries: number,
    private readonly retryDelayMs: number,
  ) {}

  get unsavedPlayerCount(): number {
    let count = 0;
    for (const state of this.states.values()) {
      if (state.dirty || state.pendingCount > 0 || state.failed) count++;
    }
    return count;
  }

  track(player: Player, now: number): void {
    if (this.states.has(player.id)) {
      throw new Error(`character ${player.id} is already tracked`);
    }
    this.states.set(player.id, {
      player,
      nextExpectedVersion: player.version,
      dirty: false,
      online: true,
      pendingCount: 0,
      failed: null,
      tail: Promise.resolve(),
      lastQueuedAt: now,
      nextProgressionEventIndex: 0,
      externalMutationPending: false,
      externalMutationCompletion: null,
      settleExternalMutation: null,
      discardOnUntrack: false,
      // The player was just loaded from the store, so the rows match now.
      lastSkillsFingerprint: this.skillsFingerprint(player),
      lastStorageFingerprint: this.storageFingerprint(player.storageSnapshot),
    });
  }

  markDirty(player: Player): void {
    const state = this.states.get(player.id);
    if (!state || state.player !== player) return;
    state.dirty = true;
    this.dirtyStates.add(state);
    this.nextIntervalScanAt = Math.min(
      this.nextIntervalScanAt,
      state.lastQueuedAt + this.saveIntervalMs,
    );
  }

  saveNow(player: Player, now: number): void {
    this.markDirty(player);
    const state = this.states.get(player.id);
    if (state && !state.externalMutationPending) {
      this.enqueueSnapshot(state, now);
    }
  }

  async beginExternalMutation(
    player: Player,
    now: number,
    options: BeginExternalMutationOptions = {},
  ): Promise<number> {
    const state = this.states.get(player.id);
    if (
      !state ||
      state.player !== player ||
      state.externalMutationPending ||
      state.failed
    ) {
      throw new Error("character cannot begin an external mutation");
    }
    state.externalMutationPending = true;
    state.externalMutationCompletion = new Promise<void>((resolve) => {
      state.settleExternalMutation = resolve;
    });
    if (state.dirty && options.flushDirty !== false) {
      this.enqueueSnapshot(state, now);
    }
    try {
      await state.tail;
      if (state.failed) throw state.failed;
      return state.nextExpectedVersion;
    } catch (cause) {
      this.settleExternalMutation(state);
      throw cause;
    }
  }

  completeExternalMutation(
    player: Player,
    expectedVersion: number,
    characterVersion: number,
  ): void {
    const state = this.states.get(player.id);
    if (
      !state ||
      state.player !== player ||
      !state.externalMutationPending ||
      state.nextExpectedVersion !== expectedVersion ||
      characterVersion !== expectedVersion + 1
    ) {
      throw new Error("character external mutation version mismatch");
    }
    state.nextExpectedVersion = characterVersion;
    this.settleExternalMutation(state);
    this.removeSettledState(player.id, state);
  }

  cancelExternalMutation(player: Player): void {
    const state = this.states.get(player.id);
    if (!state || state.player !== player) return;
    this.settleExternalMutation(state);
    this.removeSettledState(player.id, state);
  }

  failExternalMutation(player: Player, cause: unknown): void {
    const state = this.states.get(player.id);
    if (!state || state.player !== player) return;
    state.failed = cause;
    state.discardOnUntrack = true;
    this.dirtyStates.delete(state);
    this.settleExternalMutation(state);
    this.removeSettledState(player.id, state);
  }

  isExternalMutationPending(player: Player): boolean {
    const state = this.states.get(player.id);
    return Boolean(
      state?.player === player && state.externalMutationPending,
    );
  }

  tick(now: number): void {
    if (now < this.nextIntervalScanAt) return;
    let queued = 0;
    let nextScanAt = Number.POSITIVE_INFINITY;
    for (const state of this.dirtyStates) {
      if (
        !state.online ||
        state.failed ||
        state.externalMutationPending
      ) {
        nextScanAt = Math.min(nextScanAt, now + 250);
        continue;
      }
      const dueAt = state.lastQueuedAt + this.saveIntervalMs;
      if (now < dueAt) {
        nextScanAt = Math.min(nextScanAt, dueAt);
        continue;
      }
      this.enqueueSnapshot(state, now);
      queued++;
      if (queued >= MAX_INTERVAL_SNAPSHOTS_PER_TICK) {
        nextScanAt = now;
        break;
      }
    }
    this.nextIntervalScanAt = nextScanAt;
  }

  untrack(player: Player, now: number): void {
    const state = this.states.get(player.id);
    if (!state || state.player !== player) return;
    state.online = false;
    this.dirtyStates.delete(state);
    if (state.discardOnUntrack) {
      this.states.delete(player.id);
      return;
    }
    if (state.dirty && !state.failed && !state.externalMutationPending) {
      this.enqueueSnapshot(state, now);
    }
    this.removeSettledState(player.id, state);
  }

  async flushCharacter(characterId: string): Promise<void> {
    let state = this.states.get(characterId);
    if (!state) return;
    if (state.externalMutationCompletion) {
      await state.externalMutationCompletion;
      state = this.states.get(characterId);
      if (!state) return;
    }
    if (
      state.dirty &&
      !state.failed &&
      !state.externalMutationPending
    ) {
      this.enqueueSnapshot(state, monotonicNow());
    }
    await state.tail;
    if (state.failed) throw state.failed;
    this.removeSettledState(characterId, state);
  }

  async stop(): Promise<void> {
    const tails: Promise<void>[] = [];
    const now = monotonicNow();
    for (const [characterId, state] of this.states) {
      state.online = false;
      if (state.dirty && !state.failed && !state.externalMutationPending) {
        this.enqueueSnapshot(state, now);
      }
      tails.push(state.tail);
      this.removeSettledState(characterId, state);
    }
    await Promise.allSettled(tails);
    for (const [characterId, state] of this.states) {
      this.removeSettledState(characterId, state);
    }
  }

  private enqueueSnapshot(state: SaveState, now: number): void {
    if (!state.dirty || state.failed) return;
    const skillsFingerprint = this.skillsFingerprint(state.player);
    const storageValues = state.player.storageSnapshot;
    const storageFingerprint = this.storageFingerprint(storageValues);
    const snapshot = this.snapshot(
      state.player,
      state.nextExpectedVersion,
      state.nextProgressionEventIndex,
      storageValues,
      skillsFingerprint !== state.lastSkillsFingerprint,
      storageFingerprint !== state.lastStorageFingerprint,
    );
    state.lastSkillsFingerprint = skillsFingerprint;
    state.lastStorageFingerprint = storageFingerprint;
    state.dirty = false;
    this.dirtyStates.delete(state);
    state.nextExpectedVersion += 1;
    state.nextProgressionEventIndex += snapshot.progressionEvents.length;
    state.pendingCount += 1;
    state.lastQueuedAt = now;
    const save = state.tail.then(async () => {
      const version = await this.saveWithRetries(snapshot);
      if (version !== snapshot.expectedVersion + 1) {
        throw new Error("character save returned an unexpected version");
      }
    });
    state.tail = save
      .catch((cause: unknown) => {
        state.failed = cause;
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.error(
          `failed to persist character ${state.player.id}: ${reason}`,
        );
        throw cause;
      })
      .finally(() => {
        state.pendingCount -= 1;
        this.removeSettledState(state.player.id, state);
      });
    void state.tail.catch(() => undefined);
  }

  private async saveWithRetries(
    snapshot: CharacterSaveSnapshot,
  ): Promise<number> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.store.saveSnapshot(snapshot);
      } catch (cause) {
        if (
          attempt >= this.maxRetries ||
          !isTransientDatabaseError(cause)
        ) {
          throw cause;
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, this.retryDelayMs * (attempt + 1));
        });
      }
    }
  }

  private snapshot(
    player: Player,
    expectedVersion: number,
    progressionEventIndex: number,
    storageValues: Readonly<Record<string, number>>,
    skillsChanged: boolean,
    storageChanged: boolean,
  ): CharacterSaveSnapshot {
    return {
      characterId: player.id,
      expectedVersion,
      vocation: player.vocation,
      progressionDefinitionVersion: player.progression.definitionVersion,
      level: player.level,
      experience: BigInt(player.experience),
      magicLevel: player.progression.magicLevel,
      manaSpent: BigInt(player.progression.manaSpent),
      health: player.health,
      mana: player.mana,
      soul: player.progression.soul,
      skills: player.progression.skills,
      skillsChanged,
      progressionEvents:
        player.progression.sessionProgressionEvents.slice(
          progressionEventIndex,
        ),
      storageValues,
      storageChanged,
      positionX: player.position.x,
      positionY: player.position.y,
      positionZ: player.position.z,
      direction: player.direction,
      outfit: player.outfit,
      skull: player.skull,
      skullExpiresAt:
        player.skullExpiresAt === null ? null : new Date(player.skullExpiresAt),
      wheelBonus: player.wheelStatModifier,
    };
  }

  private skillsFingerprint(player: Player): string {
    let fingerprint = "";
    for (const skill of player.progression.skills) {
      fingerprint += `${skill.skill}:${skill.level}:${skill.tries};`;
    }
    return fingerprint;
  }

  private storageFingerprint(
    storageValues: Readonly<Record<string, number>>,
  ): string {
    return JSON.stringify(storageValues);
  }

  private removeSettledState(characterId: string, state: SaveState): void {
    if (
      state.online ||
      state.dirty ||
      state.pendingCount > 0 ||
      state.failed ||
      state.externalMutationPending
    ) {
      return;
    }
    if (this.states.get(characterId) === state) {
      this.states.delete(characterId);
      this.dirtyStates.delete(state);
    }
  }

  private settleExternalMutation(state: SaveState): void {
    state.externalMutationPending = false;
    state.settleExternalMutation?.();
    state.externalMutationCompletion = null;
    state.settleExternalMutation = null;
  }
}
