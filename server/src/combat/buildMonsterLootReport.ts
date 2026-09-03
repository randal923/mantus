import type { MonsterType } from "../creature/MonsterType";
import type { ItemCatalog } from "../item/ItemCatalog";
import { resolveMonsterLootType } from "./resolveMonsterLootType";

export interface MonsterLootReport {
  /** Monsters carrying at least one loot entry. */
  readonly lootBearingMonsters: number;
  readonly entries: number;
  readonly resolvedEntries: number;
  /** Distinct item names no pinned catalog type carries, sorted. */
  readonly unresolvedItemNames: ReadonlyArray<string>;
  readonly unresolvedEntries: number;
  /** Loot-bearing monsters whose corpse type id is 0 — the loot is unreachable. */
  readonly monstersWithoutCorpse: ReadonlyArray<string>;
  /** Loot-bearing monsters whose corpse type is not a container. */
  readonly monstersWithUncontainableCorpse: ReadonlyArray<string>;
  /** Entries carrying Canary's `unique` flag, which the roll does not model. */
  readonly uniqueEntries: number;
  /** Entries whose count band is wider than one item. */
  readonly countedEntries: number;
}

/**
 * Aggregates every pinned monster loot table against the item catalog. The
 * numbers are pinned by `monsterLootParity.test.ts`, so re-importing Canary
 * content — or changing the item catalog — fails loudly the moment an entry,
 * a count band, a corpse container, or the unresolved-item budget drifts.
 */
export function buildMonsterLootReport(
  monsterTypes: Iterable<MonsterType>,
  catalog: ItemCatalog,
): MonsterLootReport {
  let lootBearingMonsters = 0;
  let entries = 0;
  let resolvedEntries = 0;
  let uniqueEntries = 0;
  let countedEntries = 0;
  const unresolvedItemNames = new Set<string>();
  const monstersWithoutCorpse: string[] = [];
  const monstersWithUncontainableCorpse: string[] = [];
  for (const type of monsterTypes) {
    if (type.loot.length === 0) continue;
    lootBearingMonsters += 1;
    const corpse =
      type.corpseItemTypeId > 0
        ? catalog.get(type.corpseItemTypeId)
        : undefined;
    // A corpse is sized to its loot, so only "a container at all" matters.
    if (type.corpseItemTypeId === 0) monstersWithoutCorpse.push(type.id);
    else if (corpse?.containerCapacity === undefined) {
      monstersWithUncontainableCorpse.push(type.id);
    }
    for (const entry of type.loot) {
      entries += 1;
      if (entry.unique) uniqueEntries += 1;
      if (entry.maxCount > 1) countedEntries += 1;
      const resolved = resolveMonsterLootType(entry, {
        byId: (id) => catalog.get(id),
        byName: (name) => catalog.findByName(name),
      });
      if (resolved) {
        resolvedEntries += 1;
        continue;
      }
      unresolvedItemNames.add(
        entry.itemName ?? `#${String(entry.itemTypeId ?? 0)}`,
      );
    }
  }
  return {
    lootBearingMonsters,
    entries,
    resolvedEntries,
    unresolvedItemNames: [...unresolvedItemNames].sort(),
    unresolvedEntries: entries - resolvedEntries,
    monstersWithoutCorpse: monstersWithoutCorpse.sort(),
    monstersWithUncontainableCorpse: monstersWithUncontainableCorpse.sort(),
    uniqueEntries,
    countedEntries,
  };
}
