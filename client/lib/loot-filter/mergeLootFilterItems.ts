import type { LootFilterItem } from "@tibia/protocol";

/**
 * Everything the loot-filter window can draw, keyed by type id. Server data
 * wins over the static creature-loot asset, so a carried item keeps its live
 * count while the catalog only fills in types the character does not hold.
 */
export function mergeLootFilterItems(
  carried: ReadonlyArray<LootFilterItem>,
  ignored: ReadonlyArray<LootFilterItem>,
  catalog: ReadonlyArray<LootFilterItem>,
): ReadonlyMap<number, LootFilterItem> {
  const merged = new Map<number, LootFilterItem>();
  for (const item of catalog) merged.set(item.typeId, item);
  for (const item of ignored) merged.set(item.typeId, item);
  for (const item of carried) merged.set(item.typeId, item);
  return merged;
}
