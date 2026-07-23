import { describe, expect, it } from "vitest";
import type { InventoryItem, InventoryState } from "@tibia/protocol";
import { validateItemOp } from "./validateItemOp";

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
const SWORD = makeItem("00000000-0000-4000-8000-000000000001", {
  equipmentSlot: "weapon",
});
const KNIGHT_SWORD = makeItem("00000000-0000-4000-8000-000000000002", {
  equipmentSlot: "weapon",
  tooltip: {
    name: "knight sword",
    typeLine: "sword weapons",
    spriteId: 100,
    affixes: [],
    weight: 10,
    requiredLevel: 10,
    vocations: ["Knight", "Elite Knight"],
  },
});
const TWO_HANDER = makeItem("00000000-0000-4000-8000-000000000003", {
  equipmentSlot: "weapon",
  twoHanded: true,
});
const SHIELD = makeItem("00000000-0000-4000-8000-000000000004", {
  equipmentSlot: "shield",
});
const HELMET = makeItem("00000000-0000-4000-8000-000000000005", {
  equipmentSlot: "helmet",
});

const makeState = (overrides: Partial<InventoryState> = {}): InventoryState => ({
  revision: 1,
  equipment: { backpack: BACKPACK },
  items: [
    { slot: 0, item: POUCH },
    { slot: 1, item: SWORD },
    { slot: 2, item: KNIGHT_SWORD },
    { slot: 3, item: TWO_HANDER },
    { slot: 4, item: SHIELD },
    { slot: 5, item: HELMET },
  ],
  gold: 0,
  platinum: 0,
  crystal: 0,
  capacityUsed: 5,
  usedWeight: 500,
  capacityMax: 100,
  slotCount: 20,
  containers: [
    {
      container: POUCH,
      parentContainerId: BACKPACK.id,
      capacity: 8,
      items: [],
    },
  ],
  ...overrides,
});

const KNIGHT = {
  level: 20,
  vocation: "Knight",
  position: { x: 100, y: 100, z: 7 },
} as const;

describe("validateItemOp", () => {
  it("allows equipping an item that meets every requirement", () => {
    expect(
      validateItemOp(
        { kind: "equip", itemId: KNIGHT_SWORD.id, slot: "weapon" },
        makeState(),
        KNIGHT,
      ),
    ).toBeNull();
  });

  it("rejects equipping into a slot the item does not fit", () => {
    expect(
      validateItemOp(
        { kind: "equip", itemId: HELMET.id, slot: "weapon" },
        makeState(),
        KNIGHT,
      ),
    ).toBe("wrong-slot");
  });

  it("rejects equipping above the character's level", () => {
    expect(
      validateItemOp(
        { kind: "equip", itemId: KNIGHT_SWORD.id, slot: "weapon" },
        makeState(),
        { ...KNIGHT, level: 1 },
      ),
    ).toBe("level-too-low");
  });

  it("rejects equipping outside the item's vocations", () => {
    expect(
      validateItemOp(
        { kind: "equip", itemId: KNIGHT_SWORD.id, slot: "weapon" },
        makeState(),
        { ...KNIGHT, vocation: "Druid" },
      ),
    ).toBe("wrong-vocation");
  });

  it("rejects a two-handed weapon while a shield is equipped", () => {
    expect(
      validateItemOp(
        { kind: "equip", itemId: TWO_HANDER.id, slot: "weapon" },
        makeState({ equipment: { backpack: BACKPACK, shield: SHIELD } }),
        KNIGHT,
      ),
    ).toBe("two-handed-conflict");
  });

  it("rejects a shield while a two-handed weapon is equipped", () => {
    expect(
      validateItemOp(
        { kind: "equip", itemId: SHIELD.id, slot: "shield" },
        makeState({ equipment: { backpack: BACKPACK, weapon: TWO_HANDER } }),
        KNIGHT,
      ),
    ).toBe("shield-conflict");
  });

  it("allows equipping when the item is not in the projection", () => {
    expect(
      validateItemOp(
        { kind: "equip", itemId: crypto.randomUUID(), slot: "weapon" },
        makeState(),
        KNIGHT,
      ),
    ).toBeNull();
  });

  it("rejects moving an item to a slot beyond the container capacity", () => {
    expect(
      validateItemOp(
        {
          kind: "move",
          itemId: SWORD.id,
          destinationContainerId: POUCH.id,
          destinationSlot: 8,
        },
        makeState(),
        KNIGHT,
      ),
    ).toBe("invalid-destination");
  });

  it("rejects moving a container into itself or its contents", () => {
    expect(
      validateItemOp(
        {
          kind: "move",
          itemId: POUCH.id,
          destinationContainerId: POUCH.id,
          destinationSlot: 0,
        },
        makeState(),
        KNIGHT,
      ),
    ).toBe("invalid-destination");
  });

  it("allows moving onto an occupied slot so the server can swap or merge", () => {
    expect(
      validateItemOp(
        {
          kind: "move",
          itemId: SWORD.id,
          destinationContainerId: BACKPACK.id,
          destinationSlot: 5,
        },
        makeState(),
        KNIGHT,
      ),
    ).toBeNull();
  });

  it("rejects unequipping into an occupied destination slot", () => {
    expect(
      validateItemOp(
        {
          kind: "unequip",
          itemId: SWORD.id,
          slot: "weapon",
          destination: { containerId: BACKPACK.id, slot: 5 },
        },
        makeState({ equipment: { backpack: BACKPACK, weapon: SWORD } }),
        KNIGHT,
      ),
    ).toBe("invalid-destination");
  });

  it("allows the server to atomically make room for a front placement", () => {
    expect(
      validateItemOp(
        {
          kind: "unequip",
          itemId: SWORD.id,
          slot: "weapon",
          destination: {
            containerId: BACKPACK.id,
            slot: 0,
            placement: "front",
          },
        },
        makeState({ equipment: { backpack: BACKPACK, weapon: SWORD } }),
        KNIGHT,
      ),
    ).toBeNull();
  });

  it("allows unequipping into a free destination slot", () => {
    expect(
      validateItemOp(
        {
          kind: "unequip",
          itemId: SWORD.id,
          slot: "weapon",
          destination: { containerId: BACKPACK.id, slot: 10 },
        },
        makeState({ equipment: { backpack: BACKPACK, weapon: SWORD } }),
        KNIGHT,
      ),
    ).toBeNull();
  });

  it("allows dropping an inventory item throughout the current viewport", () => {
    expect(
      validateItemOp(
        { kind: "drop", itemId: SWORD.id, position: { x: 108, y: 100, z: 7 } },
        makeState(),
        KNIGHT,
        { x: 9, y: 7 },
      ),
    ).toBeNull();
  });

  it("rejects dropping an inventory item outside the current viewport", () => {
    expect(
      validateItemOp(
        { kind: "drop", itemId: SWORD.id, position: { x: 110, y: 100, z: 7 } },
        makeState(),
        KNIGHT,
        { x: 9, y: 7 },
      ),
    ).toBe("out-of-range");
  });

  it("rejects picking up an item from a far tile", () => {
    expect(
      validateItemOp(
        {
          kind: "pickup",
          itemId: crypto.randomUUID(),
          revision: 1,
          position: { x: 100, y: 100, z: 6 },
        },
        makeState(),
        KNIGHT,
      ),
    ).toBe("out-of-range");
  });

  it("rejects picking up more weight than the capacity budget", () => {
    expect(
      validateItemOp(
        {
          kind: "pickup",
          itemId: crypto.randomUUID(),
          revision: 1,
          position: { x: 100, y: 101, z: 7 },
          weight: 9_501,
        },
        makeState(),
        KNIGHT,
      ),
    ).toBe("too-heavy");
  });

  it("allows picking up weight that fits the capacity budget", () => {
    expect(
      validateItemOp(
        {
          kind: "pickup",
          itemId: crypto.randomUUID(),
          revision: 1,
          position: { x: 100, y: 101, z: 7 },
          weight: 9_500,
        },
        makeState(),
        KNIGHT,
      ),
    ).toBeNull();
  });

  it("rejects throwing a map item beyond the current viewport", () => {
    expect(
      validateItemOp(
        {
          kind: "move-map",
          itemId: crypto.randomUUID(),
          revision: 1,
          fromPosition: { x: 101, y: 100, z: 7 },
          toPosition: { x: 108, y: 100, z: 7 },
        },
        makeState(),
        KNIGHT,
        { x: 7, y: 7 },
      ),
    ).toBe("too-far");
  });

  it("allows throwing a map item throughout the current viewport", () => {
    expect(
      validateItemOp(
        {
          kind: "move-map",
          itemId: crypto.randomUUID(),
          revision: 1,
          fromPosition: { x: 101, y: 100, z: 7 },
          toPosition: { x: 108, y: 100, z: 7 },
        },
        makeState(),
        KNIGHT,
        { x: 9, y: 7 },
      ),
    ).toBeNull();
  });
});
