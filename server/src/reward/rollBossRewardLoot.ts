import type { MonsterLoot } from "../creature/MonsterType";
import type { ItemType } from "../item/ItemType";
import type { LootItemCreation } from "../item/LootItemCreation";
import type { RarityConfig } from "../rarity/RarityConfig";
import { rollRarityAttributes } from "../rarity/rollRarityAttributes";
import { isBossEquipmentReward } from "./isBossEquipmentReward";

export interface BossRewardRoll {
  resolve(entry: MonsterLoot): ItemType | undefined;
  chance(percent: number): boolean;
  integer(minimum: number, maximum: number): number;
}

/**
 * One boss-reward loot pass (Canary monstertype.lua generateLootRoll driven
 * through monster.lua getBossReward): each entry rolls at
 * chance × lootFactor × uniform(0.95..1.05), unique entries drop only for
 * the top scorer, and bonus passes (equipmentOnly) keep equipment while
 * excluding uniques. Counts follow the corpse roll's conventions.
 */
export function rollBossRewardLoot(input: {
  readonly entries: ReadonlyArray<MonsterLoot>;
  readonly lootFactor: number;
  readonly lootRate: number;
  readonly topScore: boolean;
  readonly equipmentOnly: boolean;
  readonly capacity: number;
  readonly roll: BossRewardRoll;
  readonly rarityConfig?: RarityConfig;
}): LootItemCreation[] {
  const loot: LootItemCreation[] = [];
  for (const entry of input.entries) {
    if (loot.length >= input.capacity) break;
    if (entry.unique && !input.topScore) continue;
    if (input.equipmentOnly && entry.unique) continue;
    const type = input.roll.resolve(entry);
    if (!type) continue;
    if (input.equipmentOnly && !isBossEquipmentReward(type)) continue;
    const jitter = input.roll.integer(95, 105) / 100;
    const percent = Math.min(
      100,
      (entry.chance / 1_000) * input.lootRate * input.lootFactor * jitter,
    );
    if (percent <= 0 || !input.roll.chance(percent)) continue;
    const count =
      type.maxCount > 1
        ? input.roll.integer(
            Math.min(entry.minCount, type.maxCount),
            Math.min(entry.maxCount, type.maxCount),
          )
        : 1;
    if (count < 1) continue;
    const attributes = input.rarityConfig
      ? rollRarityAttributes(type, input.roll, input.rarityConfig)
      : undefined;
    loot.push({ typeId: type.id, count, ...(attributes ? { attributes } : {}) });
  }
  return loot;
}
