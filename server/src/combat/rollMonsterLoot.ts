import type { MonsterLoot } from "../creature/MonsterType";
import type { ItemType } from "../item/ItemType";
import type { LootItemCreation } from "../item/LootItemCreation";
import type { RarityConfig } from "../rarity/RarityConfig";
import { rollRarityAttributes } from "../rarity/rollRarityAttributes";

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
 * The corpse is sized to the loot afterwards (Canary `Container:addLoot`
 * adds with FLAG_NOLIMIT), so a table longer than the corpse's slot count
 * still drops in full; the caller applies the hard per-corpse ceiling.
 */
export function rollMonsterLoot(
  entries: ReadonlyArray<MonsterLoot>,
  lootRate: number,
  roll: MonsterLootRoll,
  rarityConfig?: RarityConfig,
): LootItemCreation[] {
  const loot: LootItemCreation[] = [];
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
    // With all-zero chances this draws no RNG, keeping seeded parity runs
    // byte-identical to a build without rarity.
    const attributes = rarityConfig
      ? rollRarityAttributes(type, roll, rarityConfig)
      : undefined;
    loot.push({ typeId: type.id, count, ...(attributes ? { attributes } : {}) });
  }
  return loot;
}
