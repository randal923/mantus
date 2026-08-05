/**
 * Drop chance per rarity grade, in percent of eligible dropped items
 * (fractions allowed, resolution 0.001%). Sourced from `config.yml`; all
 * zeros disables rarity rolls entirely.
 */
export interface RarityChances {
  readonly uncommon: number;
  readonly rare: number;
  readonly epic: number;
  readonly legendary: number;
}

export const DISABLED_RARITY_CHANCES: RarityChances = {
  uncommon: 0,
  rare: 0,
  epic: 0,
  legendary: 0,
};
