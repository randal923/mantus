import { describe, expect, it } from "vitest";
import type {
  ContainerState,
  InventoryItem,
  InventoryState,
} from "@tibia/protocol";
import { applyPendingItemOp } from "./applyPendingItemOp";

const makeItem = (
  id: string,
  overrides: Partial<InventoryItem> = {},
): InventoryItem => ({
  id,
  typeId: 100,
  clientId: 100,
  spriteId: 100,
  name: "thing",
  count: 1,
  revision: 1,
  tooltip: {
    name: "thing",
    typeLine: "item",
    spriteId: 100,
    affixes: [],
    weight: 10,
  },
  ...overrides,
});

const BACKPACK = makeItem("00000000-0000-4000-8000-00000000000b", {
  equipmentSlot: "backpack",
  containerCapacity: 20,
});
const POUCH = makeItem("00000000-0000-4000-8000-00000000000c", {
  containerCapacity: 8,
});
const HELMET = makeItem("00000000-0000-4000-8000-000000000001", {
  equipmentSlot: "helmet",
});
const GOLD = makeItem("00000000-0000-4000-8000-000000000002", {
  typeId: 3031,
  count: 40,
});
const MORE_GOLD = makeItem("00000000-0000-4000-8000-000000000003", {
  typeId: 3031,
  count: 30,
});

const makeState = (
  overrides: Partial<InventoryState> = {},
): InventoryState => ({
  revision: 1,
  equipment: { backpack: BACKPACK },
  items: [
    { slot: 0, item: POUCH },
    { slot: 1, item: HELMET },
    { slot: 2, item: GOLD },
  ],
  gold: 40,
  platinum: 0,
  crystal: 0,
  capacityUsed: 5,
  capacityMax: 100,
  slotCount: 20,
  containers: [
    {
      container: POUCH,
      parentContainerId: BACKPACK.id,
      capacity: 8,
      items: [{ slot: 0, item: MORE_GOLD }],
    },
  ],
  ...overrides,
});

const pouchSection = (state: InventoryState | null): ContainerState | null =>
  state?.containers?.find(
    (container) => container.container.id === POUCH.id,
  ) ?? null;

describe("applyPendingItemOp", () => {
  it("moves an item from the backpack grid into an open container slot", () => {
    const next = applyPendingItemOp(makeState(), {
      kind: "move",
      itemId: HELMET.id,
      destinationContainerId: POUCH.id,
      destinationSlot: 3,
    });
    expect(next?.items.map((entry) => entry.item.id)).toEqual([
      POUCH.id,
      GOLD.id,
    ]);
    expect(pouchSection(next)?.items).toContainEqual({
      slot: 3,
      item: HELMET,
    });
  });

  it("moves an item into the backpack grid and its open section together", () => {
    const state = makeState({
      containers: [
        {
          container: BACKPACK,
          parentContainerId: null,
          capacity: 20,
          items: [
            { slot: 0, item: POUCH },
            { slot: 1, item: HELMET },
            { slot: 2, item: GOLD },
          ],
        },
      ],
    });
    const next = applyPendingItemOp(state, {
      kind: "move",
      itemId: HELMET.id,
      destinationContainerId: BACKPACK.id,
      destinationSlot: 7,
    });
    expect(next?.items).toContainEqual({ slot: 7, item: HELMET });
    expect(
      next?.containers?.[0]?.items.find(
        (entry) => entry.item.id === HELMET.id,
      ),
    ).toEqual({ slot: 7, item: HELMET });
  });

  it("predicts merging matching stacks", () => {
    const next = applyPendingItemOp(makeState(), {
      kind: "move",
      itemId: GOLD.id,
      destinationContainerId: POUCH.id,
      destinationSlot: 0,
    });
    expect(next?.items.some((entry) => entry.item.id === GOLD.id)).toBe(false);
    expect(pouchSection(next)?.items[0]?.item.count).toBe(70);
  });

  it("does not predict a move onto a different occupant", () => {
    const next = applyPendingItemOp(makeState(), {
      kind: "move",
      itemId: HELMET.id,
      destinationContainerId: POUCH.id,
      destinationSlot: 0,
    });
    expect(next).toBeNull();
  });

  it("does not predict a move into a container that is not visible", () => {
    const next = applyPendingItemOp(makeState({ containers: [] }), {
      kind: "move",
      itemId: HELMET.id,
      destinationContainerId: POUCH.id,
      destinationSlot: 3,
    });
    expect(next).toBeNull();
  });

  it("equips into an empty slot and removes the source entry", () => {
    const next = applyPendingItemOp(makeState(), {
      kind: "equip",
      itemId: HELMET.id,
      slot: "helmet",
    });
    expect(next?.equipment.helmet?.id).toBe(HELMET.id);
    expect(next?.items.some((entry) => entry.item.id === HELMET.id)).toBe(
      false,
    );
  });

  it("does not predict equipping into an occupied slot", () => {
    const state = makeState({
      equipment: { backpack: BACKPACK, helmet: makeItem("other") },
    });
    expect(
      applyPendingItemOp(state, {
        kind: "equip",
        itemId: HELMET.id,
        slot: "helmet",
      }),
    ).toBeNull();
  });

  it("unequips into the first free backpack slot", () => {
    const state = makeState({
      equipment: { backpack: BACKPACK, helmet: HELMET },
      items: [
        { slot: 0, item: POUCH },
        { slot: 2, item: GOLD },
      ],
    });
    const next = applyPendingItemOp(state, {
      kind: "unequip",
      itemId: HELMET.id,
      slot: "helmet",
    });
    expect(next?.equipment.helmet).toBeUndefined();
    expect(next?.items).toContainEqual({ slot: 1, item: HELMET });
  });

  it("drops an item and closes the open sections it contained", () => {
    const next = applyPendingItemOp(makeState(), {
      kind: "drop",
      itemId: POUCH.id,
      position: { x: 1, y: 2, z: 7 },
    });
    expect(next?.items.some((entry) => entry.item.id === POUCH.id)).toBe(
      false,
    );
    expect(next?.containers).toEqual([]);
  });

  it("returns null for an unknown item", () => {
    expect(
      applyPendingItemOp(makeState(), {
        kind: "drop",
        itemId: "00000000-0000-4000-8000-0000000000ff",
        position: { x: 1, y: 2, z: 7 },
      }),
    ).toBeNull();
  });
});
