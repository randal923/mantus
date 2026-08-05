import type { ItemRarity } from "@tibia/protocol";
import {
  DEFAULT_AFFIX_RANGES,
  DEFAULT_RARITY_AFFIX_COUNTS,
  DEFAULT_RARITY_VALUE_MULTIPLIERS,
  type AffixValueRange,
} from "./affixDefinitions";
import { DISABLED_RARITY_CHANCES, type RarityChances } from "./RarityChances";
import type { AffixId } from "./RolledAffix";

/**
 * The whole rarity tuning surface, sourced from `config.yml`'s `rarity`
 * block: drop chances, how many affixes each grade rolls, the per-grade
 * value multiplier, and each affix's base band.
 */
export interface RarityConfig {
  readonly chances: RarityChances;
  readonly affixCounts: Readonly<Record<ItemRarity, number>>;
  readonly valueMultipliers: Readonly<Record<ItemRarity, number>>;
  readonly affixes: Readonly<Record<AffixId, AffixValueRange>>;
}

/** Rarity switched off: zero chances over the default tables. */
export const DISABLED_RARITY_CONFIG: RarityConfig = {
  chances: DISABLED_RARITY_CHANCES,
  affixCounts: DEFAULT_RARITY_AFFIX_COUNTS,
  valueMultipliers: DEFAULT_RARITY_VALUE_MULTIPLIERS,
  affixes: DEFAULT_AFFIX_RANGES,
};
