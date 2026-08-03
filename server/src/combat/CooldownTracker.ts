import type { CooldownStore, PersistedCooldown } from "./CooldownStore";

/**
 * Write-behind spell-cooldown persistence. Writes are fire-and-forget but
 * chained per character, and `load` waits for that character's chain first,
 * so a logout write always lands before the next login's read — the same
 * ordering `CharacterPersistence.flushCharacter` gives the snapshot save.
 */
export class CooldownTracker {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly pendingWrites = new Set<Promise<void>>();

  constructor(private readonly store?: CooldownStore) {}

  async load(characterId: string): Promise<ReadonlyArray<PersistedCooldown>> {
    if (!this.store) return [];
    await this.tails.get(characterId);
    return this.store.load(characterId);
  }

  /**
   * Replaces the character's persisted set with `cooldowns` — always a full
   * replace, so an empty set (a death wiped the map) erases the old rows.
   */
  flush(
    characterId: string,
    cooldowns: ReadonlyArray<PersistedCooldown>,
  ): void {
    const store = this.store;
    if (!store) return;
    const write = (this.tails.get(characterId) ?? Promise.resolve())
      .then(() => store.replace(characterId, cooldowns))
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(
          `failed to persist cooldowns for ${characterId}: ${reason}`,
        );
      });
    this.tails.set(characterId, write);
    this.pendingWrites.add(write);
    void write.finally(() => {
      this.pendingWrites.delete(write);
      if (this.tails.get(characterId) === write) {
        this.tails.delete(characterId);
      }
    });
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingWrites]);
  }
}
