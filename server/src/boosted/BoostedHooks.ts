import type { Monster } from "../creature/Monster";

/**
 * Read-only view of today's boost consumed at execution time by the kill
 * (exp), corpse (loot), spawn (interval), and bosstiary (kill count) paths.
 */
export interface BoostedHooks {
  /** True when the killed monster's race is today's boosted creature. */
  isBoostedCreature(monster: Monster): boolean;
  /** Bosstiary kill increment for this boss race (3 while boosted, else 1). */
  bossKillIncrement(raceId: number): number;
  /** Respawn-interval divisor for a monster type (2 while boosted, else 1). */
  respawnDelayDivisor(monsterTypeId: string): number;
  boostedBossRaceId(): number | null;
}
