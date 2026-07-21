import type { InventoryItem, InventoryState } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { getPotionBarItems } from "./getPotionBarItems";
import { getEffectivePotionActionBar } from "./getEffectivePotionActionBar";

function makeItem(
  id: string,
  typeId: number,
  count: number,
  useKind: InventoryItem["useKind"] = "potion",
): InventoryItem {
  return {
    id,
    typeId,
    clientId: typeId,
    spriteId: typeId,
    name: `item ${typeId}`,
    stackable: true,
    maxCount: 100,
    count,
    revision: 1,
    useKind,
    tooltip: {
      name: `item ${typeId}`,
      typeLine: "item",
      spriteId: typeId,
      affixes: [],
      weight: 1,
    },
  };
}

describe("getPotionBarItems", () => {
  it("groups carried potions across equipment, inventory, and open containers", () => {
    const backpack = makeItem(
      "00000000-0000-4000-8000-000000000001",
      2854,
      1,
      "container",
    );
    const firstHealth = makeItem(
      "00000000-0000-4000-8000-000000000002",
      266,
      2,
    );
    const secondHealth = makeItem(
      "00000000-0000-4000-8000-000000000003",
      266,
      3,
    );
    const mana = makeItem(
      "00000000-0000-4000-8000-000000000004",
      268,
      4,
    );
    const state: InventoryState = {
      revision: 1,
      equipment: { backpack },
      items: [
        { slot: 0, item: mana },
        { slot: 1, item: firstHealth },
      ],
      gold: 0,
      platinum: 0,
      crystal: 0,
      capacityUsed: 0,
      usedWeight: 0,
      capacityMax: 100,
      slotCount: 20,
      containers: [
        {
          container: backpack,
          parentContainerId: null,
          capacity: 20,
          items: [{ slot: 0, item: secondHealth }],
        },
      ],
    };

    expect(getPotionBarItems(state)).toEqual([
      { item: firstHealth, count: 5 },
      { item: mana, count: 4 },
    ]);
  });

  it("returns no slots without an inventory", () => {
    expect(getPotionBarItems(null)).toEqual([]);
  });

  it("auto-fills new bars with crosshair mode and preserves configured modes", () => {
    const health = makeItem(
      "00000000-0000-4000-8000-000000000005",
      266,
      2,
    );
    const carried = [{ item: health, count: 2 }];

    expect(getEffectivePotionActionBar([], carried)).toEqual([
      { itemTypeId: 266, targetMode: "crosshair" },
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(
      getEffectivePotionActionBar(
        [{ itemTypeId: 266, targetMode: "self" }],
        [],
      ),
    ).toEqual([
      { itemTypeId: 266, targetMode: "self" },
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});
