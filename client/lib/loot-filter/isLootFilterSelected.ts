import type { ItemDisplayRarity, LootFilterRule } from "@tibia/protocol";

/**
 * Whether one cell is on the pick-up list. A rule that names no grades takes
 * the type whole, so every grade cell of that type reads as selected.
 */
export function isLootFilterSelected(
  rules: ReadonlyMap<number, LootFilterRule>,
  typeId: number,
  rarity?: ItemDisplayRarity,
): boolean {
  const rule = rules.get(typeId);
  if (!rule) return false;
  if (!rule.rarities || !rarity) return true;
  return rule.rarities.includes(rarity);
}
