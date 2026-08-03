/** One persisted fight-state cooldown; readyAt is epoch milliseconds. */
export interface PersistedCooldown {
  readonly key: string;
  readonly readyAt: number;
  readonly totalMs: number;
}

/**
 * Durable spell-cooldown storage. `replace` swaps the character's whole set
 * in one statement (empty set included — death clears the map and the next
 * logout write must erase the old rows), and `load` runs once at login.
 */
export interface CooldownStore {
  load(characterId: string): Promise<ReadonlyArray<PersistedCooldown>>;
  replace(
    characterId: string,
    cooldowns: ReadonlyArray<PersistedCooldown>,
  ): Promise<void>;
}
