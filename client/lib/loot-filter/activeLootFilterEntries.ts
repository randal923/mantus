import type { LootFilter, LootFilterItem } from "@tibia/protocol";
import type { LootFilterEntry } from "./LootFilterEntry";
import { lootFilterEntryKey } from "./lootFilterEntryKey";

/**
 * The pick-up list as cells: one per rule, or one per named grade when the
 * rule narrows a type to some of them. Rules whose type is not in `known`
 * are skipped — the server lists every rule's type in its items reply, so a
 * gap means the catalog no longer has that type at all.
 */
export function activeLootFilterEntries(
  filter: LootFilter,
  known: ReadonlyMap<number, LootFilterItem>,
): ReadonlyArray<LootFilterEntry> {
  return filter.pickupRules.flatMap<LootFilterEntry>((rule) => {
    const item = known.get(rule.typeId);
    if (!item) return [];
    const base = {
      typeId: item.typeId,
      name: item.name,
      spriteId: item.spriteId,
    };
    if (!rule.rarities) {
      return [
        {
          ...base,
          ...(item.count === undefined ? {} : { count: item.count }),
          key: lootFilterEntryKey(item.typeId),
          tooltip: item.tooltip,
        },
      ];
    }
    // No carried count on grade cells: the count is the type's, not a grade's.
    return rule.rarities.map((rarity) => ({
      ...base,
      key: lootFilterEntryKey(item.typeId, rarity),
      rarity,
      tooltip: { ...item.tooltip, rarity },
    }));
  });
}
