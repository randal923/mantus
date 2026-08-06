import type { LootFilterItem } from "@tibia/protocol";

/**
 * Every item type the window can search or name, keyed by type id. Server
 * data wins over the static creature-loot asset, so a type the character
 * carries or lists is described by the live catalog while the asset only
 * fills in everything else a creature can drop.
 */
export function mergeLootFilterItems(
  types: ReadonlyArray<LootFilterItem>,
  catalog: ReadonlyArray<LootFilterItem>,
): ReadonlyMap<number, LootFilterItem> {
  const merged = new Map<number, LootFilterItem>();
  for (const item of catalog) merged.set(item.typeId, item);
  for (const item of types) merged.set(item.typeId, item);
  return merged;
}
