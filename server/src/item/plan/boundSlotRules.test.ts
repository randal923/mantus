import { describe, expect, it } from "vitest";
import { planTradeReservation } from "../../trade/planTradeReservation";
import { ITEM_POUCH_TYPE_ID } from "../itemPouchTypeId";
import type { Item } from "../Item";
import { ItemCatalog } from "../ItemCatalog";
import type { ItemType } from "../ItemType";
import { planDrop } from "./planDrop";
import { planEquip } from "./planEquip";
import { planMoveToContainer } from "./planMoveToContainer";
import { planSplitStack } from "./planSplitStack";
import { planUnequip } from "./planUnequip";
import type { WorldItemsView } from "./WorldItemsView";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BACKPACK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOUND_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const POUCH_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SELLER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const LOOT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SWORD_ID = "abababab-abab-4bab-8bab-abababababab";

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
const BOUND_TYPE = 23_396;
const SELLER_TYPE = 60_109;
const LOOT_TYPE = 12;
const SWORD_TYPE = 13;

const catalog = new ItemCatalog([
  makeItemType({ id: BACKPACK_TYPE, containerCapacity: 20 }),
  makeItemType({ id: BOUND_TYPE, containerCapacity: 20, movable: false }),
  makeItemType({
    id: ITEM_POUCH_TYPE_ID,
    containerCapacity: 500,
    movable: false,
  }),
  makeItemType({ id: SELLER_TYPE, movable: false }),
  makeItemType({ id: LOOT_TYPE, stackable: true, maxCount: 100, weight: 1 }),
  makeItemType({ id: SWORD_TYPE, equipmentSlot: "weapon" }),
]);

const fixture = (): Item[] => [
  {
    id: BACKPACK_ID,
    typeId: BACKPACK_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "equipment", characterId: CHARACTER_ID, slot: "backpack" },
  },
  {
    id: BOUND_ID,
    typeId: BOUND_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "equipment", characterId: CHARACTER_ID, slot: "bound" },
  },
  {
    id: POUCH_ID,
    typeId: ITEM_POUCH_TYPE_ID,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId: BOUND_ID, slot: 0 },
  },
  {
    id: LOOT_ID,
    typeId: LOOT_TYPE,
    count: 5,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId: POUCH_ID, slot: 0 },
  },
  {
    id: SWORD_ID,
    typeId: SWORD_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
  },
];

const emptyWorld: WorldItemsView = {
  getWorldItem: () => undefined,
  getWorldSubtree: () => [],
  getTileItems: () => [],
} as unknown as WorldItemsView;

describe("bound slot rules", () => {
  it("refuses to move a bound direct child out of the bound container", () => {
    expect(
      planMoveToContainer({
        characterId: CHARACTER_ID,
        catalog,
        items: fixture(),
        itemId: POUCH_ID,
        expectedVersion: 1,
        destinationContainerId: BACKPACK_ID,
        destinationVersion: 1,
        destinationSlot: 1,
      }),
    ).toBeNull();
  });

  it("allows reordering a bound direct child within the bound container", () => {
    expect(
      planMoveToContainer({
        characterId: CHARACTER_ID,
        catalog,
        items: fixture(),
        itemId: POUCH_ID,
        expectedVersion: 1,
        destinationContainerId: BOUND_ID,
        destinationVersion: 1,
        destinationSlot: 3,
      }),
    ).not.toBeNull();
  });

  it("refuses to move an arbitrary item into the bound container", () => {
    expect(
      planMoveToContainer({
        characterId: CHARACTER_ID,
        catalog,
        items: fixture(),
        itemId: SWORD_ID,
        expectedVersion: 1,
        destinationContainerId: BOUND_ID,
        destinationVersion: 1,
        destinationSlot: 1,
      }),
    ).toBeNull();
  });

  it("lets a Portable Seller enter the bound container, one-way", () => {
    const items = [
      ...fixture(),
      {
        id: SELLER_ID,
        typeId: SELLER_TYPE,
        count: 1,
        attributes: {},
        version: 1,
        location: { kind: "container", containerId: BACKPACK_ID, slot: 1 },
      } satisfies Item,
    ];
    expect(
      planMoveToContainer({
        characterId: CHARACTER_ID,
        catalog,
        items,
        itemId: SELLER_ID,
        expectedVersion: 1,
        destinationContainerId: BOUND_ID,
        destinationVersion: 1,
        destinationSlot: 1,
      }),
    ).not.toBeNull();

    const inside = items.map((item) =>
      item.id === SELLER_ID
        ? {
            ...item,
            location: {
              kind: "container" as const,
              containerId: BOUND_ID,
              slot: 1,
            },
          }
        : item,
    );
    expect(
      planMoveToContainer({
        characterId: CHARACTER_ID,
        catalog,
        items: inside,
        itemId: SELLER_ID,
        expectedVersion: 1,
        destinationContainerId: BACKPACK_ID,
        destinationVersion: 1,
        destinationSlot: 1,
      }),
    ).toBeNull();
  });

  it("refuses a swap that would displace a bound child outward", () => {
    const items = [
      ...fixture(),
      {
        id: SELLER_ID,
        typeId: SELLER_TYPE,
        count: 1,
        attributes: {},
        version: 1,
        location: { kind: "container", containerId: BACKPACK_ID, slot: 1 },
      } satisfies Item,
    ];
    // Aiming the seller at the pouch's occupied slot would swap the pouch
    // into the backpack.
    expect(
      planMoveToContainer({
        characterId: CHARACTER_ID,
        catalog,
        items,
        itemId: SELLER_ID,
        expectedVersion: 1,
        destinationContainerId: BOUND_ID,
        destinationVersion: 1,
        destinationSlot: 0,
      }),
    ).toBeNull();
  });

  it("keeps the loot inside the pouch freely movable", () => {
    expect(
      planMoveToContainer({
        characterId: CHARACTER_ID,
        catalog,
        items: fixture(),
        itemId: LOOT_ID,
        expectedVersion: 1,
        destinationContainerId: BACKPACK_ID,
        destinationVersion: 1,
        destinationSlot: 1,
      }),
    ).not.toBeNull();
  });

  it("allows moving loot into the pouch from the backpack", () => {
    const items = fixture().map((item) =>
      item.id === LOOT_ID
        ? {
            ...item,
            location: {
              kind: "container" as const,
              containerId: BACKPACK_ID,
              slot: 2,
            },
          }
        : item,
    );
    expect(
      planMoveToContainer({
        characterId: CHARACTER_ID,
        catalog,
        items,
        itemId: LOOT_ID,
        expectedVersion: 1,
        destinationContainerId: POUCH_ID,
        destinationVersion: 1,
        destinationSlot: 1,
      }),
    ).not.toBeNull();
  });

  it("never unequips the bound container", () => {
    expect(
      planUnequip({
        characterId: CHARACTER_ID,
        catalog,
        items: fixture(),
        itemId: BOUND_ID,
        expectedVersion: 1,
        slot: "bound",
      }),
    ).toBeNull();
  });

  it("never drops a bound direct child on the ground", () => {
    expect(
      planDrop({
        characterId: CHARACTER_ID,
        catalog,
        carried: { items: fixture() },
        world: emptyWorld,
        itemId: POUCH_ID,
        expectedVersion: 1,
        position: { x: 100, y: 100, z: 7 },
      }),
    ).toBeNull();
  });

  it("moves a store delivery out of the bound container", () => {
    const items = fixture().map((item) =>
      item.id === SWORD_ID
        ? {
            ...item,
            location: {
              kind: "container" as const,
              containerId: BOUND_ID,
              slot: 3,
            },
          }
        : item,
    );
    expect(
      planMoveToContainer({
        characterId: CHARACTER_ID,
        catalog,
        items,
        itemId: SWORD_ID,
        expectedVersion: 1,
        destinationContainerId: BACKPACK_ID,
        destinationVersion: 1,
        destinationSlot: 1,
      }),
    ).not.toBeNull();
  });

  it("splits a delivered stack inside the bound container", () => {
    const items = [
      ...fixture(),
      {
        id: SELLER_ID,
        typeId: LOOT_TYPE,
        count: 10,
        attributes: {},
        version: 1,
        location: { kind: "container", containerId: BOUND_ID, slot: 2 },
      } satisfies Item,
    ];
    expect(
      planSplitStack({
        characterId: CHARACTER_ID,
        catalog,
        items,
        itemId: SELLER_ID,
        expectedVersion: 1,
        count: 3,
      }),
    ).not.toBeNull();
  });

  it("equips a store delivery straight from the bound container", () => {
    const items = fixture().map((item) =>
      item.id === SWORD_ID
        ? {
            ...item,
            location: {
              kind: "container" as const,
              containerId: BOUND_ID,
              slot: 3,
            },
          }
        : item,
    );
    expect(
      planEquip({
        characterId: CHARACTER_ID,
        catalog,
        items,
        level: 100,
        vocation: "Knight",
        itemId: SWORD_ID,
        expectedVersion: 1,
        slot: "weapon",
      }),
    ).not.toBeNull();
  });

  it("never trade-reserves the bound container or its direct children", () => {
    expect(
      planTradeReservation({
        characterId: CHARACTER_ID,
        items: fixture(),
        itemId: BOUND_ID,
        expectedVersion: 1,
      }),
    ).toBeNull();
    expect(
      planTradeReservation({
        characterId: CHARACTER_ID,
        items: fixture(),
        itemId: POUCH_ID,
        expectedVersion: 1,
      }),
    ).toBeNull();
  });

  it("still trade-reserves loot from inside the pouch", () => {
    expect(
      planTradeReservation({
        characterId: CHARACTER_ID,
        items: fixture(),
        itemId: LOOT_ID,
        expectedVersion: 1,
      }),
    ).not.toBeNull();
  });

  it("never aims unequip at the bound container as a destination", () => {
    const items = fixture().map((item) =>
      item.id === SWORD_ID
        ? {
            ...item,
            location: {
              kind: "equipment" as const,
              characterId: CHARACTER_ID,
              slot: "weapon" as const,
            },
          }
        : item,
    );
    expect(
      planUnequip({
        characterId: CHARACTER_ID,
        catalog,
        items,
        itemId: SWORD_ID,
        expectedVersion: 1,
        slot: "weapon",
        destination: { containerId: BOUND_ID, containerRevision: 1, slot: 4 },
      }),
    ).toBeNull();
  });
});
