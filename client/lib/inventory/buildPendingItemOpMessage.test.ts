import { describe, expect, it } from "vitest";
import type { InventoryItem, InventoryState } from "@tibia/protocol";
import { buildPendingItemOpMessage } from "./buildPendingItemOpMessage";

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
  revision: 4,
});
const HELMET = makeItem("00000000-0000-4000-8000-000000000001", {
  equipmentSlot: "helmet",
  revision: 3,
});

const STATE: InventoryState = {
  revision: 1,
  equipment: { backpack: BACKPACK },
  items: [{ slot: 1, item: HELMET }],
  gold: 0,
  platinum: 0,
  crystal: 0,
  capacityUsed: 5,
  capacityMax: 100,
  slotCount: 20,
  containers: [],
};

describe("buildPendingItemOpMessage", () => {
  it("resolves revisions from the confirmed inventory at send time", () => {
    expect(
      buildPendingItemOpMessage(
        {
          kind: "move",
          itemId: HELMET.id,
          destinationContainerId: BACKPACK.id,
          destinationSlot: 5,
        },
        STATE,
      ),
    ).toEqual({
      type: "move-item",
      itemId: HELMET.id,
      revision: 3,
      destinationContainerId: BACKPACK.id,
      destinationRevision: 4,
      destinationSlot: 5,
    });
  });

  it("returns null when the item no longer exists", () => {
    expect(
      buildPendingItemOpMessage(
        {
          kind: "move",
          itemId: "00000000-0000-4000-8000-0000000000ff",
          destinationContainerId: BACKPACK.id,
          destinationSlot: 5,
        },
        STATE,
      ),
    ).toBeNull();
  });

  it("builds an unequip intent with a refreshed destination revision", () => {
    const state: InventoryState = {
      ...STATE,
      equipment: { backpack: BACKPACK, helmet: HELMET },
      items: [],
    };
    expect(
      buildPendingItemOpMessage(
        {
          kind: "unequip",
          itemId: HELMET.id,
          slot: "helmet",
          destination: { containerId: BACKPACK.id, slot: 2 },
        },
        state,
      ),
    ).toEqual({
      type: "unequip-item",
      itemId: HELMET.id,
      revision: 3,
      slot: "helmet",
      destination: {
        containerId: BACKPACK.id,
        containerRevision: 4,
        slot: 2,
      },
    });
  });

  it("builds a pickup intent with a refreshed destination revision", () => {
    expect(
      buildPendingItemOpMessage(
        {
          kind: "pickup",
          itemId: "map:100:100:7:1",
          revision: 2,
          position: { x: 100, y: 100, z: 7 },
          destination: { containerId: BACKPACK.id, slot: 4 },
        },
        STATE,
      ),
    ).toEqual({
      type: "pickup-item",
      itemId: "map:100:100:7:1",
      revision: 2,
      position: { x: 100, y: 100, z: 7 },
      destination: {
        containerId: BACKPACK.id,
        containerRevision: 4,
        slot: 4,
      },
    });
    expect(
      buildPendingItemOpMessage(
        {
          kind: "pickup",
          itemId: "map:100:100:7:1",
          revision: 2,
          position: { x: 100, y: 100, z: 7 },
          destination: {
            containerId: "00000000-0000-4000-8000-0000000000ff",
            slot: 4,
          },
        },
        STATE,
      ),
    ).toBeNull();
  });

  it("builds a map move intent without touching inventory state", () => {
    expect(
      buildPendingItemOpMessage(
        {
          kind: "move-map",
          itemId: "map:100:100:7:1",
          revision: 3,
          fromPosition: { x: 100, y: 100, z: 7 },
          toPosition: { x: 102, y: 101, z: 7 },
        },
        STATE,
      ),
    ).toEqual({
      type: "move-map-item",
      itemId: "map:100:100:7:1",
      revision: 3,
      fromPosition: { x: 100, y: 100, z: 7 },
      toPosition: { x: 102, y: 101, z: 7 },
    });
  });

  it("builds a drop intent", () => {
    expect(
      buildPendingItemOpMessage(
        { kind: "drop", itemId: HELMET.id, position: { x: 1, y: 2, z: 7 } },
        STATE,
      ),
    ).toEqual({
      type: "drop-item",
      itemId: HELMET.id,
      revision: 3,
      position: { x: 1, y: 2, z: 7 },
    });
  });
});
