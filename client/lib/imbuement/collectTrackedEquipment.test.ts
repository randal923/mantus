import { describe, expect, it } from "vitest";
import type { InventoryItem, InventoryState } from "@tibia/protocol";
import { collectTrackedEquipment } from "./collectTrackedEquipment";
import { imbuementTrackerTimeOf } from "./imbuementTrackerTimeOf";

let nextId = 0;

function makeItem(input: {
  name: string;
  slots: number;
  imbuements?: InventoryItem["imbuements"];
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
    ...(input.imbuements ? { imbuements: input.imbuements } : {}),
    tooltip: {
      name: input.name,
      typeLine: "Armors",
      spriteId: 1652,
      affixes: [],
      ...(input.slots > 0 ? { imbuementSlots: input.slots } : {}),
      weight: 100,
    },
  };
}

function makeInventory(
  equipment: InventoryState["equipment"],
): InventoryState {
  return {
    revision: 7,
    equipment,
    items: [],
    gold: 0,
    platinum: 0,
    crystal: 0,
    capacityUsed: 0,
    usedWeight: 0,
    capacityMax: 1_000,
    slotCount: 0,
  };
}

describe("collectTrackedEquipment", () => {
  it("keeps equipped pieces with imbuement slots, in paper-doll order", () => {
    const tracked = collectTrackedEquipment(
      makeInventory({
        boots: makeItem({ name: "boots of haste", slots: 1 }),
        helmet: makeItem({ name: "royal helmet", slots: 2 }),
        amulet: makeItem({ name: "scarf", slots: 0 }),
      }),
    );

    expect(tracked.map((entry) => entry.slot)).toEqual(["helmet", "boots"]);
    expect(tracked[0]?.slotCount).toBe(2);
  });

  it("still lists a piece whose running imbuements outnumber its affix", () => {
    // A tooltip affix can go missing; the running imbuements are the floor.
    const tracked = collectTrackedEquipment(
      makeInventory({
        weapon: makeItem({
          name: "cobra sword",
          slots: 0,
          imbuements: [
            {
              slot: 0,
              name: "Powerful Scorch",
              iconId: 15,
              remainingSeconds: 3_600,
              aggressive: true,
            },
          ],
        }),
      }),
    );

    expect(tracked).toHaveLength(1);
    expect(tracked[0]?.slotCount).toBe(1);
  });

  it("drops equipment that can hold no imbuement at all", () => {
    expect(
      collectTrackedEquipment(
        makeInventory({ ring: makeItem({ name: "ring", slots: 0 }) }),
      ),
    ).toEqual([]);
  });
});

describe("imbuementTrackerTimeOf", () => {
  it("colours by the official tracker's thresholds", () => {
    expect(imbuementTrackerTimeOf(45)).toEqual({ text: "45s", tone: "urgent" });
    expect(imbuementTrackerTimeOf(3_540)).toEqual({
      text: "59m",
      tone: "urgent",
    });
    expect(imbuementTrackerTimeOf(7_260)).toEqual({
      text: "2h01",
      tone: "soon",
    });
    expect(imbuementTrackerTimeOf(72_000)).toEqual({
      text: "20h",
      tone: "normal",
    });
  });

  it("reports an expired slot instead of a negative countdown", () => {
    expect(imbuementTrackerTimeOf(-5)).toEqual({ text: "0m", tone: "expired" });
  });
});
