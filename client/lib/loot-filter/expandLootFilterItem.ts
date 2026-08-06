import { ITEM_DISPLAY_RARITIES, type LootFilterItem } from "@tibia/protocol";
import type { LootFilterEntry } from "./LootFilterEntry";
import { lootFilterEntryKey } from "./lootFilterEntryKey";

/**
 * The cells one item type contributes to the search pane: five, one per
 * grade, for gear that can roll one — the server marks those by composing a
 * tooltip with a rarity on it — and a single cell for everything else.
 */
export function expandLootFilterItem(
  item: LootFilterItem,
): ReadonlyArray<LootFilterEntry> {
  if (!item.tooltip.rarity) {
    return [
      {
        key: lootFilterEntryKey(item.typeId),
        typeId: item.typeId,
        name: item.name,
        spriteId: item.spriteId,
        ...(item.count === undefined ? {} : { count: item.count }),
        tooltip: item.tooltip,
      },
    ];
  }
  // No carried count on grade cells: the server counts a type, not a grade,
  // and stamping the same number on all five reads as five separate stacks.
  return ITEM_DISPLAY_RARITIES.map((rarity) => ({
    key: lootFilterEntryKey(item.typeId, rarity),
    typeId: item.typeId,
    name: item.name,
    spriteId: item.spriteId,
    rarity,
    // The grade the cell stands for, not the one the catalog entry shipped
    // with: the tooltip is what tells the player which one they are choosing.
    tooltip: { ...item.tooltip, rarity },
  }));
}
