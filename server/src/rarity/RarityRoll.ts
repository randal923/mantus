/**
 * The slice of the server-owned RNG rarity rolls need; `CombatFormula`
 * satisfies it structurally. Never `Math.random` — loot RNG stays seeded
 * and server-side per the security charter.
 */
export interface RarityRoll {
  readonly integer: (minimum: number, maximum: number) => number;
}
