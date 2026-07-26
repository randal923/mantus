import { describe, expect, it } from "vitest";
import type { MonsterLoot } from "../creature/MonsterType";
import type { ItemType } from "../item/ItemType";
import { rollBossRewardLoot, type BossRewardRoll } from "./rollBossRewardLoot";

function type(partial: Partial<ItemType> & { id: number }): ItemType {
  return {
    name: `item-${partial.id}`,
    stackable: false,
    maxCount: 1,
    weight: 10,
    pickupable: true,
    movable: true,
    ...partial,
  } as ItemType;
}

const TYPES = new Map<number, ItemType>([
  [100, type({ id: 100, equipmentSlot: "armor" })],
  [101, type({ id: 101 })],
  [102, type({ id: 102, stackable: true, maxCount: 100 })],
  [103, type({ id: 103, equipmentSlot: "ammo" })],
]);

function roll(options: { pass: boolean; jitter?: number }): BossRewardRoll {
  return {
    resolve: (entry) =>
      entry.itemTypeId === undefined ? undefined : TYPES.get(entry.itemTypeId),
    chance: () => options.pass,
    integer: (minimum, maximum) =>
      minimum === 95 && maximum === 105 ? (options.jitter ?? 100) : maximum,
  };
}

function entry(partial: Partial<MonsterLoot> & { itemTypeId: number }): MonsterLoot {
  return { chance: 100_000, minCount: 1, maxCount: 1, unique: false, ...partial };
}

describe("rollBossRewardLoot", () => {
  it("keeps unique entries for the top scorer only", () => {
    const entries = [entry({ itemTypeId: 101, unique: true })];
    const forTop = rollBossRewardLoot({
      entries,
      lootFactor: 1,
      lootRate: 1,
      topScore: true,
      equipmentOnly: false,
      capacity: 32,
      roll: roll({ pass: true }),
    });
    const forOther = rollBossRewardLoot({
      entries,
      lootFactor: 1,
      lootRate: 1,
      topScore: false,
      equipmentOnly: false,
      capacity: 32,
      roll: roll({ pass: true }),
    });
    expect(forTop).toEqual([{ typeId: 101, count: 1 }]);
    expect(forOther).toEqual([]);
  });

  it("bonus passes keep equipment and exclude uniques and ammunition", () => {
    const entries = [
      entry({ itemTypeId: 100 }),
      entry({ itemTypeId: 101 }),
      entry({ itemTypeId: 103 }),
      entry({ itemTypeId: 100, unique: true }),
    ];
    const bonus = rollBossRewardLoot({
      entries,
      lootFactor: 1,
      lootRate: 1,
      topScore: true,
      equipmentOnly: true,
      capacity: 32,
      roll: roll({ pass: true }),
    });
    expect(bonus).toEqual([{ typeId: 100, count: 1 }]);
  });

  it("stackable counts clamp into the type maximum", () => {
    const loot = rollBossRewardLoot({
      entries: [entry({ itemTypeId: 102, minCount: 5, maxCount: 400 })],
      lootFactor: 1,
      lootRate: 1,
      topScore: true,
      equipmentOnly: false,
      capacity: 32,
      roll: roll({ pass: true }),
    });
    expect(loot).toEqual([{ typeId: 102, count: 100 }]);
  });

  it("returns nothing when the chance roll fails", () => {
    const loot = rollBossRewardLoot({
      entries: [entry({ itemTypeId: 101 })],
      lootFactor: 1,
      lootRate: 1,
      topScore: true,
      equipmentOnly: false,
      capacity: 32,
      roll: roll({ pass: false }),
    });
    expect(loot).toEqual([]);
  });
});
