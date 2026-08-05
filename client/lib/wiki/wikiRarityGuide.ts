import type { ItemRarity } from "@tibia/protocol";

export interface WikiRarityGuideEntry {
  readonly rarity: ItemRarity;
  readonly affixCount: number;
  readonly valueMultiplier: number;
}

/**
 * Mirrors `rarity.affixCounts` and `rarity.valueMultipliers` in `config.yml`
 * (defaults in `server/src/rarity/affixDefinitions.ts`); update together.
 */
export const WIKI_RARITY_GUIDE: ReadonlyArray<WikiRarityGuideEntry> = [
  { rarity: "uncommon", affixCount: 1, valueMultiplier: 1 },
  { rarity: "rare", affixCount: 2, valueMultiplier: 1.5 },
  { rarity: "epic", affixCount: 3, valueMultiplier: 2.25 },
  { rarity: "legendary", affixCount: 4, valueMultiplier: 3 },
];
