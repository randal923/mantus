import { describe, expect, it } from "vitest";
import type { InventoryItem, InventoryState } from "@tibia/protocol";
import { quiverDropDestination } from "./quiverDropDestination";

const makeItem = (
  id: string,
  overrides: Partial<InventoryItem> = {},
): InventoryItem => ({
  id,
  typeId: 100,
  clientId: 100,
  spriteId: 100,
  name: "thing",
  stackable: false,
  maxCount: 1,
  count: 1,
  revision: 1,
  tooltip: { name: "thing", typeLine: "item", spriteId: 100, affixes: [], weight: 10 },
  ...overrides,
});

const QUIVER = makeItem("00000000-0000-4000-8000-000000000001", {
  equipmentSlot: "shield",
  quiver: true,
  containerCapacity: 2,
});
const ARROW = makeItem("00000000-0000-4000-8000-000000000002", {
  typeId: 3447,
  stackable: true,
  maxCount: 100,
  count: 10,
});
const BOLT = makeItem("00000000-0000-4000-8000-000000000003", {
  typeId: 3446,
  stackable: true,
  maxCount: 100,
  count: 10,
});

const makeState = (
  containers: InventoryState["containers"],
): InventoryState => ({
  revision: 1,
  equipment: { shield: QUIVER },
  items: [],
  gold: 0,
  platinum: 0,
  crystal: 0,
  capacityUsed: 0,
  usedWeight: 0,
  capacityMax: 100,
  slotCount: 0,
  containers,
});

const openQuiver = (items: InventoryState["items"]) => ({
  container: QUIVER,
  parentContainerId: null,
  capacity: 2,
  items,
});

describe("quiverDropDestination", () => {
  it("drops to the front of a quiver that is not open", () => {
    expect(quiverDropDestination(makeState(undefined), QUIVER, ARROW)).toEqual({
      slot: 0,
      placement: "front",
    });
  });

  it("merges onto a matching stack with room", () => {
    const state = makeState([
      openQuiver([
        { slot: 0, item: BOLT },
        { slot: 1, item: { ...ARROW, count: 40 } },
      ]),
    ]);
    expect(quiverDropDestination(state, QUIVER, ARROW)).toEqual({ slot: 1 });
  });

  it("takes the first free slot when nothing merges", () => {
    const state = makeState([openQuiver([{ slot: 0, item: BOLT }])]);
    expect(quiverDropDestination(state, QUIVER, ARROW)).toEqual({ slot: 1 });
  });

  it("skips a full stack of the same type", () => {
    const state = makeState([
      openQuiver([{ slot: 0, item: { ...ARROW, count: 100 } }]),
    ]);
    expect(quiverDropDestination(state, QUIVER, ARROW)).toEqual({ slot: 1 });
  });

  it("returns null when the open quiver is full", () => {
    const state = makeState([
      openQuiver([
        { slot: 0, item: BOLT },
        { slot: 1, item: { ...ARROW, count: 100 } },
      ]),
    ]);
    expect(quiverDropDestination(state, QUIVER, ARROW)).toBeNull();
  });
});
