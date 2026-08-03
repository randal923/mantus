import { describe, expect, it } from "vitest";
import type { InventoryItem, InventoryState } from "@tibia/protocol";
import { collectImbuableItems } from "./collectImbuableItems";

let nextId = 0;

function makeItem(input: {
  name: string;
  slots: number;
  containerCapacity?: number;
}): InventoryItem {
  nextId += 1;
  return {
    id: `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
    typeId: 100 + nextId,
    clientId: 100 + nextId,
    spriteId: 1652,
    name: input.name,
    stackable: false,
    maxCount: 1,
    count: 1,
    revision: 1,
    ...(input.containerCapacity !== undefined
      ? { containerCapacity: input.containerCapacity }
      : {}),
    tooltip: {
      name: input.name,
      typeLine: "Armors",
      spriteId: 1652,
      affixes:
        input.slots > 0 ? [{ text: `Imbuement Slots ${input.slots}` }] : [],
      weight: 100,
    },
  };
}

function makeInventory(input: {
  equipment: InventoryState["equipment"];
  items?: InventoryState["items"];
  containers?: InventoryState["containers"];
}): InventoryState {
  return {
    revision: 7,
    equipment: input.equipment,
    items: input.items ?? [],
    gold: 0,
    platinum: 0,
    crystal: 0,
    capacityUsed: 0,
    usedWeight: 0,
    capacityMax: 1_000,
    slotCount: 20,
    ...(input.containers ? { containers: input.containers } : {}),
  };
}

describe("collectImbuableItems", () => {
  it("lists only the worn backpack, never the spares inside it", () => {
    const backpack = makeItem({
      name: "backpack",
      slots: 1,
      containerCapacity: 20,
    });
    const spare = makeItem({
      name: "beach backpack",
      slots: 1,
      containerCapacity: 20,
    });
    const sword = makeItem({ name: "cobra sword", slots: 2 });

    const imbuable = collectImbuableItems(
      makeInventory({
        equipment: { backpack },
        items: [
          { slot: 0, item: spare },
          { slot: 1, item: sword },
        ],
      }),
    );

    expect(imbuable.map((entry) => entry.item.name)).toEqual([
      "backpack",
      "cobra sword",
    ]);
  });

  it("marks worn pieces and lists them before carried ones", () => {
    const helmet = makeItem({ name: "royal helmet", slots: 2 });
    const spare = makeItem({ name: "crown helmet", slots: 1 });

    const imbuable = collectImbuableItems(
      makeInventory({
        equipment: { helmet },
        items: [{ slot: 0, item: spare }],
      }),
    );

    expect(imbuable).toEqual([
      { item: helmet, equipped: true },
      { item: spare, equipped: false },
    ]);
  });

  it("lists an item once when its bag is also open", () => {
    const backpack = makeItem({
      name: "backpack",
      slots: 0,
      containerCapacity: 20,
    });
    const sword = makeItem({ name: "cobra sword", slots: 2 });

    const imbuable = collectImbuableItems(
      makeInventory({
        equipment: { backpack },
        items: [{ slot: 0, item: sword }],
        containers: [
          {
            container: backpack,
            parentContainerId: null,
            capacity: 20,
            items: [{ slot: 0, item: sword }],
          },
        ],
      }),
    );

    expect(imbuable).toEqual([{ item: sword, equipped: false }]);
  });

  it("drops carried pieces that have no imbuement slots", () => {
    expect(
      collectImbuableItems(
        makeInventory({
          equipment: {},
          items: [{ slot: 0, item: makeItem({ name: "scarf", slots: 0 }) }],
        }),
      ),
    ).toEqual([]);
  });
});
