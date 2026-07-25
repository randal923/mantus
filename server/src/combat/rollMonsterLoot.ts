import type { MonsterLoot } from "../creature/MonsterType";
import type { ItemType } from "../item/ItemType";
import type { LootItemCreation } from "../item/LootItemCreation";

/** Canary's `MAX_LOOTCHANCE`: loot chances are per hundred thousand. */
const MAX_LOOT_CHANCE = 100_000;

export interface MonsterLootRoll {
  /** Resolves a loot entry's item id or name to a catalog type. */
  readonly resolve: (entry: MonsterLoot) => ItemType | undefined;
  /** Server-owned RNG: percentage roll and inclusive integer roll. */
  readonly chance: (percent: number) => boolean;
  readonly integer: (minimum: number, maximum: number) => number;
}

/**
 * Rolls one monster's loot table. Every roll is server-side RNG on the death
 * tick (charter: the server rolls all RNG); the caller creates the resulting
 * items atomically.
 *
 * Canary semantics: each entry is rolled once against `chance / MAX_LOOTCHANCE`
 * scaled by the server's loot rate, a stackable drop takes a count inside the
 * entry's `[minCount, maxCount]` band clamped to the type's stack limit, and a
 * non-stackable drop is always a single item however large `maxCount` is.
 * Entries beyond the corpse container's capacity simply do not fit.
 */
export function rollMonsterLoot(
  entries: ReadonlyArray<MonsterLoot>,
  capacity: number,
  lootRate: number,
  roll: MonsterLootRoll,
): LootItemCreation[] {
  const loot: LootItemCreation[] = [];
  if (capacity < 1) return loot;
  for (const entry of entries) {
    const percent = Math.min(
      100,
      (entry.chance / (MAX_LOOT_CHANCE / 100)) * lootRate,
    );
    if (!roll.chance(percent)) continue;
    const type = roll.resolve(entry);
    if (!type) continue;
    const count = type.stackable
      ? roll.integer(
          Math.min(entry.minCount, type.maxCount),
          Math.min(entry.maxCount, type.maxCount),
        )
      : 1;
    loot.push({ typeId: type.id, count });
    if (loot.length >= capacity) break;
  }
  return loot;
}
