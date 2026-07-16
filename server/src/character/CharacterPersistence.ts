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
    if (state) this.enqueueSnapshot(state, now);
  }

  tick(now: number): void {
    for (const state of this.states.values()) {
      if (!state.online || !state.dirty || state.failed) continue;
      if (now - state.lastQueuedAt < this.saveIntervalMs) continue;
      this.enqueueSnapshot(state, now);
    }
  }

  untrack(player: Player, now: number): void {
    const state = this.states.get(player.id);
    if (!state || state.player !== player) return;
    state.online = false;
    if (state.dirty && !state.failed) this.enqueueSnapshot(state, now);
    this.removeSettledState(player.id, state);
  }

  async flushCharacter(characterId: string): Promise<void> {
    const state = this.states.get(characterId);
    if (!state) return;
    if (state.dirty && !state.failed) this.enqueueSnapshot(state, Date.now());
    await state.tail;
    if (state.failed) throw state.failed;
    this.removeSettledState(characterId, state);
  }

  async stop(): Promise<void> {
    const tails: Promise<void>[] = [];
    const now = Date.now();
    for (const [characterId, state] of this.states) {
      state.online = false;
      if (state.dirty && !state.failed) this.enqueueSnapshot(state, now);
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
      positionX: player.position.x,
      positionY: player.position.y,
      positionZ: player.position.z,
      direction: player.direction,
      outfit: player.outfit,
    };
  }

  private removeSettledState(characterId: string, state: SaveState): void {
    if (state.online || state.dirty || state.pendingCount > 0 || state.failed) {
      return;
    }
    if (this.states.get(characterId) === state) {
      this.states.delete(characterId);
    }
  }
}
