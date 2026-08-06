import type { LootFilterItem } from "@tibia/protocol";
import type { LootFilterEntry } from "./LootFilterEntry";
import { lootFilterEntryKey } from "./lootFilterEntryKey";

/**
 * What the character is holding, exactly as it is holding it: one cell per
 * carried stack-and-grade, never the five hypothetical grades of its type.
 * A legendary sword in the bag is a legendary sword here — the grade cells
 * belong to the search pane, which is where an item you do not own yet is
 * chosen.
 */
export function carriedLootFilterEntries(
  carried: ReadonlyArray<LootFilterItem>,
): ReadonlyArray<LootFilterEntry> {
  return carried.map((item) => ({
    key: lootFilterEntryKey(item.typeId, item.tooltip.rarity),
    typeId: item.typeId,
    name: item.name,
    spriteId: item.spriteId,
    ...(item.count === undefined ? {} : { count: item.count }),
    ...(item.tooltip.rarity ? { rarity: item.tooltip.rarity } : {}),
    tooltip: item.tooltip,
  }));
}
