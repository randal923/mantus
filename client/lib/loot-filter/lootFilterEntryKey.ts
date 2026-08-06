import type { ItemDisplayRarity } from "@tibia/protocol";

/** List key for one loot-filter cell: an item type, optionally at one grade. */
export function lootFilterEntryKey(
  typeId: number,
  rarity?: ItemDisplayRarity,
): string {
  return rarity ? `${typeId}:${rarity}` : String(typeId);
}
