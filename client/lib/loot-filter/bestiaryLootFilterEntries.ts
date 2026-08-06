import type { BestiaryLootEntry } from "@tibia/protocol";
import { expandLootFilterItem } from "./expandLootFilterItem";
import type { LootFilterEntry } from "./LootFilterEntry";

/**
 * A creature's drop table as loot-filter cells, expanded the same way the
 * search pane expands one: a drop that can roll a grade offers all five, so a
 * table can be read straight into "rare and better dragon slayers only".
 */
export function bestiaryLootFilterEntries(
  loot: ReadonlyArray<BestiaryLootEntry>,
): ReadonlyArray<LootFilterEntry> {
  const seen = new Set<number>();
  const entries: LootFilterEntry[] = [];
  for (const drop of loot) {
    if (seen.has(drop.itemTypeId)) continue;
    seen.add(drop.itemTypeId);
    entries.push(
      ...expandLootFilterItem({
        typeId: drop.itemTypeId,
        name: drop.name ?? drop.tooltip.name,
        spriteId: drop.spriteId,
        tooltip: drop.tooltip,
      }),
    );
  }
  return entries;
}
