import { describe, expect, it } from "vitest";
import type { Item } from "../Item";
import { ItemCatalog } from "../ItemCatalog";
import type { ItemType } from "../ItemType";
import { planMoveToContainer } from "./planMoveToContainer";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BACKPACK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const POUCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COIN_A_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const COIN_B_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const COIN_C_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const makeItemType = (
  overrides: Partial<ItemType> & { id: number },
): ItemType => ({
  clientId: overrides.id,
  name: `type-${overrides.id}`,
  spriteId: overrides.id,
  stackable: false,
  maxCount: 1,
  weight: 100,
  pickupable: true,
  movable: true,
  light: { intensity: 0, color: 0 },
  elevation: 0,
  render: {
    ground: false,
    groundBorder: false,
    onBottom: false,
    onTop: false,
    stackable: false,
    fluidContainer: false,
    splash: false,
    hangable: false,
    hookSouth: false,
    hookEast: false,
    lyingCorpse: false,
    animateAlways: false,
    topEffect: false,
  },
  ...overrides,
});

const BACKPACK_TYPE = 10;
const POUCH_TYPE = 11;
const COIN_TYPE = 12;

const catalog = new ItemCatalog([
  makeItemType({ id: BACKPACK_TYPE, containerCapacity: 20 }),
  makeItemType({ id: POUCH_TYPE, containerCapacity: 5 }),
  makeItemType({ id: COIN_TYPE, stackable: true, maxCount: 100, weight: 1 }),
]);

const fixture = (): Item[] => [
  {
    id: BACKPACK_ID,
    typeId: BACKPACK_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: {
      kind: "equipment",
      characterId: CHARACTER_ID,
      slot: "backpack",
    },
  },
  {
    id: POUCH_ID,
    typeId: POUCH_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
  },
  {
    id: COIN_A_ID,
    typeId: COIN_TYPE,
    count: 80,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId: BACKPACK_ID, slot: 1 },
  },
  {
    id: COIN_B_ID,
    typeId: COIN_TYPE,
    count: 60,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId: BACKPACK_ID, slot: 2 },
  },
];

describe("planMoveToContainer", () => {
  it("rejects moving a container into itself or its descendants", () => {
    const items = fixture();
    const intoItself = planMoveToContainer({
      characterId: CHARACTER_ID,
      catalog,
      items,
      itemId: BACKPACK_ID,
      expectedVersion: 1,
      destinationContainerId: BACKPACK_ID,
      destinationVersion: 1,
      destinationSlot: 4,
    });
    expect(intoItself).toBeNull();
    const intoDescendant = planMoveToContainer({
      characterId: CHARACTER_ID,
      catalog,
      items,
      itemId: BACKPACK_ID,
      expectedVersion: 1,
      destinationContainerId: POUCH_ID,
      destinationVersion: 1,
      destinationSlot: 0,
    });
    expect(intoDescendant).toBeNull();
  });

  it("swaps rather than merges when stacks would overflow", () => {
    // 80 + 60 > maxCount 100, so the merge is ineligible and a full-count
    // move onto the occupied slot becomes a swap.
    const items = fixture();
    const plan = planMoveToContainer({
      characterId: CHARACTER_ID,
      catalog,
      items,
      itemId: COIN_A_ID,
      expectedVersion: 1,
      destinationContainerId: BACKPACK_ID,
      destinationVersion: 1,
      destinationSlot: 2,
    });
    if (!plan) throw new Error("plan was rejected");
    expect(plan.mutation.after).toHaveLength(2);
    expect(plan.mutation.removedItemIds).toBeUndefined();
    const counts = plan.mutation.after.map((item) => item.count).sort();
    expect(counts).toEqual([60, 80]);
  });

  it("caps a partial merge at the stack maximum", () => {
    const items = fixture();
    const plan = planMoveToContainer({
      characterId: CHARACTER_ID,
      catalog,
      items,
      itemId: COIN_A_ID,
      expectedVersion: 1,
      destinationContainerId: BACKPACK_ID,
      destinationVersion: 1,
      destinationSlot: 2,
      requestedCount: 40,
    });
    if (!plan) throw new Error("plan was rejected");
    const merged = plan.mutation.after.find((item) => item.id === COIN_B_ID);
    const source = plan.mutation.after.find((item) => item.id === COIN_A_ID);
    expect(merged?.count).toBe(100);
    expect(source?.count).toBe(40);
    expect(plan.persist.audits).toContainEqual(
      expect.objectContaining({
        kind: "merge",
        movedCount: 40,
        sourceRemaining: 40,
        resultCount: 100,
      }),
    );
  });

  it("rejects splitting into an occupied non-mergeable slot", () => {
    const items = fixture();
    const plan = planMoveToContainer({
      characterId: CHARACTER_ID,
      catalog,
      items,
      itemId: COIN_A_ID,
      expectedVersion: 1,
      destinationContainerId: BACKPACK_ID,
      destinationVersion: 1,
      // Pouch occupies slot 0 and coins cannot merge into it.
      destinationSlot: 0,
      requestedCount: 40,
    });
    expect(plan).toBeNull();
  });

  it("atomically moves an item to the front without duplicating occupants", () => {
    const plan = planMoveToContainer({
      characterId: CHARACTER_ID,
      catalog,
      items: fixture(),
      itemId: COIN_B_ID,
      expectedVersion: 1,
      destinationContainerId: BACKPACK_ID,
      destinationVersion: 1,
      destinationSlot: 0,
      destinationPlacement: "front",
    });
    if (!plan) throw new Error("plan was rejected");

    const locations = new Map(
      plan.mutation.after.map((item) => [item.id, item.location]),
    );
    expect(locations.get(COIN_B_ID)).toEqual({
      kind: "container",
      containerId: BACKPACK_ID,
      slot: 0,
    });
    expect(locations.get(POUCH_ID)).toEqual({
      kind: "container",
      containerId: BACKPACK_ID,
      slot: 1,
    });
    expect(locations.get(COIN_A_ID)).toEqual({
      kind: "container",
      containerId: BACKPACK_ID,
      slot: 2,
    });
    expect(new Set(plan.mutation.after.map((item) => item.id)).size).toBe(3);
    expect(plan.persist.rowOps.map((operation) => operation.kind)).toEqual([
      "stage",
      "stage",
      "write",
      "write",
      "write",
    ]);
  });

  it("rejects front placement into a full container", () => {
    const fullCatalog = new ItemCatalog([
      makeItemType({ id: BACKPACK_TYPE, containerCapacity: 3 }),
      makeItemType({ id: POUCH_TYPE, containerCapacity: 5 }),
      makeItemType({ id: COIN_TYPE, stackable: true, maxCount: 100, weight: 1 }),
    ]);
    const carried = fixture();
    carried.push({
      id: COIN_C_ID,
      typeId: COIN_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: POUCH_ID, slot: 0 },
    });

    expect(
      planMoveToContainer({
        characterId: CHARACTER_ID,
        catalog: fullCatalog,
        items: carried,
        itemId: COIN_C_ID,
        expectedVersion: 1,
        destinationContainerId: BACKPACK_ID,
        destinationVersion: 1,
        destinationSlot: 0,
        destinationPlacement: "front",
      }),
    ).toBeNull();
  });
});
