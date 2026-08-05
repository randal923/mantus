import type { ItemRarity } from "@tibia/protocol";
import type { AffixId } from "./RolledAffix";

export interface AffixValueRange {
  /** Base roll band at uncommon; higher grades scale it by the multiplier. */
  readonly minimum: number;
  readonly maximum: number;
  /** Lowest grade whose pool includes this affix; absent = any. */
  readonly minimumRarity?: ItemRarity;
}

/**
 * Built-in tuning tables, used verbatim when `config.yml`'s `rarity` block
 * omits the optional sub-blocks (and by tests). The live values a server
 * runs with come from `ServerConfig.rarity`.
 */

export const DEFAULT_RARITY_AFFIX_COUNTS: Readonly<Record<ItemRarity, number>> =
  {
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
  };

/** Value scale per rarity, applied to the base band before rounding. */
export const DEFAULT_RARITY_VALUE_MULTIPLIERS: Readonly<
  Record<ItemRarity, number>
> = {
  uncommon: 1,
  rare: 1.5,
  epic: 2.25,
  legendary: 3,
};

export const DEFAULT_AFFIX_RANGES: Readonly<Record<AffixId, AffixValueRange>> =
  {
    maxHealth: { minimum: 15, maximum: 40 },
    maxMana: { minimum: 20, maximum: 50 },
    attackSpeed: { minimum: 3, maximum: 8 },
    attack: { minimum: 1, maximum: 4 },
    defense: { minimum: 1, maximum: 4 },
    lifeLeech: { minimum: 1, maximum: 3 },
    manaLeech: { minimum: 1, maximum: 2 },
    critChance: { minimum: 1, maximum: 3 },
    critDamage: { minimum: 5, maximum: 15 },
    skill: { minimum: 1, maximum: 2 },
    magicLevel: { minimum: 1, maximum: 1, minimumRarity: "rare" },
    resistance: { minimum: 3, maximum: 8 },
  };
