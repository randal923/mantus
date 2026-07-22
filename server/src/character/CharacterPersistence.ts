import type { Player } from "../Player";
import type { CharacterSaveSnapshot } from "./Character";
import type { CharacterStore } from "./CharacterStore";
import { isTransientDatabaseError } from "./isTransientDatabaseError";

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
}

interface BeginExternalMutationOptions {
  readonly flushDirty?: boolean;
}

export class CharacterPersistence {
  private readonly states = new Map<string, SaveState>();

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
    });
  }

  markDirty(player: Player): void {
    const state = this.states.get(player.id);
    if (!state || state.player !== player) return;
    state.dirty = true;
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
    for (const state of this.states.values()) {
      if (
        !state.online ||
        !state.dirty ||
        state.failed ||
        state.externalMutationPending
      ) {
        continue;
      }
      if (now - state.lastQueuedAt < this.saveIntervalMs) continue;
      this.enqueueSnapshot(state, now);
    }
  }

  untrack(player: Player, now: number): void {
    const state = this.states.get(player.id);
    if (!state || state.player !== player) return;
    state.online = false;
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
      this.enqueueSnapshot(state, Date.now());
    }
    await state.tail;
    if (state.failed) throw state.failed;
    this.removeSettledState(characterId, state);
  }

  async stop(): Promise<void> {
    const tails: Promise<void>[] = [];
    const now = Date.now();
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
    const snapshot = this.snapshot(
      state.player,
      state.nextExpectedVersion,
      state.nextProgressionEventIndex,
    );
    state.dirty = false;
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
      progressionEvents:
        player.progression.sessionProgressionEvents.slice(
          progressionEventIndex,
        ),
      storageValues: player.storageSnapshot,
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
    }
  }

  private settleExternalMutation(state: SaveState): void {
    state.externalMutationPending = false;
    state.settleExternalMutation?.();
    state.externalMutationCompletion = null;
    state.settleExternalMutation = null;
  }
}
