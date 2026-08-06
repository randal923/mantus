import type { ItemDisplayRarity, ItemTooltipData } from "@tibia/protocol";

/**
 * One clickable cell in the loot-filter window. An item type that can roll a
 * grade produces one entry per grade, so "pick up rare dragon slayers but not
 * common ones" is a pair of independent cells rather than a hidden setting.
 * `rarity` is absent for types that never roll one — the whole type is the
 * only thing there is to choose.
 */
export interface LootFilterEntry {
  /** Stable list key: the type id, plus the grade when the type has one. */
  readonly key: string;
  readonly typeId: number;
  readonly name: string;
  readonly spriteId: number;
  /** Amount carried, when this entry came from the character's own bags. */
  readonly count?: number;
  readonly rarity?: ItemDisplayRarity;
  readonly tooltip: ItemTooltipData;
}
