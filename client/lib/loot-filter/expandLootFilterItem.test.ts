import { describe, expect, it } from "vitest";
import type { ItemTooltipData, LootFilterItem } from "@tibia/protocol";
import { expandLootFilterItem } from "./expandLootFilterItem";

function item(
  typeId: number,
  tooltip: Partial<ItemTooltipData>,
): LootFilterItem {
  return {
    typeId,
    name: "dragon slayer",
    spriteId: 42,
    tooltip: {
      name: "Dragon Slayer",
      typeLine: "Sword Weapons",
      spriteId: 42,
      affixes: [],
      weight: 8_200,
      ...tooltip,
    },
  };
}

describe("expandLootFilterItem", () => {
  it("draws one cell per grade for gear that can roll one", () => {
    const entries = expandLootFilterItem(item(664, { rarity: "common" }));
    expect(entries.map((entry) => entry.rarity)).toEqual([
      "common",
      "uncommon",
      "rare",
      "epic",
      "legendary",
    ]);
    expect(entries.map((entry) => entry.key)).toEqual([
      "664:common",
      "664:uncommon",
      "664:rare",
      "664:epic",
      "664:legendary",
    ]);
    // Each cell's tooltip states the grade it stands for, not the catalog's.
    expect(entries[3]?.tooltip.rarity).toBe("epic");
  });

  it("draws one cell for a type that never rolls a grade", () => {
    const entries = expandLootFilterItem(item(3031, {}));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.key).toBe("3031");
    expect(entries[0]?.rarity).toBeUndefined();
  });
});
