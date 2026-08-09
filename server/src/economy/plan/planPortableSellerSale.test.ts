import { BANK_LIMITS } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import type { Item } from "../../item/Item";
import { ItemCatalog } from "../../item/ItemCatalog";
import type { ItemType } from "../../item/ItemType";
import { ITEM_POUCH_TYPE_ID } from "../../item/itemPouchTypeId";
import { planPortableSellerSale } from "./planPortableSellerSale";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOUND_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const POUCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BACKPACK_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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

const BOUND_TYPE = 23_396;
const BACKPACK_TYPE = 10;
const SKULL_TYPE = 11;
const LEATHER_TYPE = 12;
const BAG_TYPE = 13;
const JUNK_TYPE = 14;

const catalog = new ItemCatalog([
  makeItemType({ id: BOUND_TYPE, containerCapacity: 20, movable: false }),
  makeItemType({ id: BACKPACK_TYPE, containerCapacity: 20 }),
  makeItemType({
    id: ITEM_POUCH_TYPE_ID,
    containerCapacity: 500,
    movable: false,
  }),
  makeItemType({ id: SKULL_TYPE, stackable: true, maxCount: 100, npcValue: 40 }),
  makeItemType({ id: LEATHER_TYPE, npcValue: 25 }),
  makeItemType({ id: BAG_TYPE, containerCapacity: 8, npcValue: 4 }),
  makeItemType({ id: JUNK_TYPE }),
]);

const baseItems = (): Item[] => [
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
    version: 3,
    location: { kind: "container", containerId: BOUND_ID, slot: 0 },
  },
  {
    id: BACKPACK_ID,
    typeId: BACKPACK_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "equipment", characterId: CHARACTER_ID, slot: "backpack" },
  },
];

const pouchChild = (
  id: string,
  typeId: number,
  count = 1,
  slot = 0,
  attributes: Item["attributes"] = {},
): Item => ({
  id,
  typeId,
  count,
  attributes,
  version: 2,
  location: { kind: "container", containerId: POUCH_ID, slot },
});

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";
const ID_D = "44444444-4444-4444-8444-444444444444";

describe("planPortableSellerSale", () => {
  it("sells the pouch contents at NPC value and credits the bank", () => {
    const items = [
      ...baseItems(),
      pouchChild(ID_A, SKULL_TYPE, 50, 0),
      pouchChild(ID_B, LEATHER_TYPE, 1, 1),
    ];
    const planned = planPortableSellerSale({
      characterId: CHARACTER_ID,
      catalog,
      items,
      bankBalance: 1_000,
    });

    expect(planned).not.toBeNull();
    expect(planned?.soldCount).toBe(51);
    expect(planned?.proceeds).toBe(50 * 40 + 25);
    expect(planned?.bankBalanceAfter).toBe(1_000 + 2_025);
    expect(planned?.mutation.removedItemIds).toEqual([ID_A, ID_B]);
    expect(planned?.persist.carried.rowOps).toEqual([
      { kind: "delete", itemId: ID_A, expectedVersion: 2 },
      { kind: "delete", itemId: ID_B, expectedVersion: 2 },
    ]);
    expect(planned?.persist.bankOps).toEqual([
      {
        characterId: CHARACTER_ID,
        delta: 2_025,
        expectedBalanceAfter: 3_025,
        ledger: "portable-seller-sale",
      },
    ]);
    expect(planned?.persist.audits).toEqual([
      {
        kind: "portable-seller-sale",
        itemCount: 51,
        stackCount: 2,
        totalProceeds: 2_025,
        balanceAfter: 3_025,
      },
    ]);
  });

  it("never sells rarity-graded items, filled containers, or worthless items", () => {
    const items = [
      ...baseItems(),
      pouchChild(ID_A, LEATHER_TYPE, 1, 0, {
        rarity: "rare",
        affixes: [{ id: "attack", value: 3 }],
      }),
      pouchChild(ID_B, BAG_TYPE, 1, 1),
      {
        ...pouchChild(ID_C, SKULL_TYPE, 10),
        location: { kind: "container" as const, containerId: ID_B, slot: 0 },
      },
      pouchChild(ID_D, JUNK_TYPE, 1, 2),
    ];
    expect(
      planPortableSellerSale({
        characterId: CHARACTER_ID,
        catalog,
        items,
        bankBalance: 0,
      }),
    ).toBeNull();
  });

  it("sells an empty container but keeps loot outside the pouch untouched", () => {
    const items = [
      ...baseItems(),
      pouchChild(ID_A, BAG_TYPE, 1, 0),
      {
        id: ID_B,
        typeId: SKULL_TYPE,
        count: 3,
        attributes: {},
        version: 1,
        location: { kind: "container" as const, containerId: BACKPACK_ID, slot: 0 },
      },
    ];
    const planned = planPortableSellerSale({
      characterId: CHARACTER_ID,
      catalog,
      items,
      bankBalance: 0,
    });

    expect(planned?.mutation.removedItemIds).toEqual([ID_A]);
    expect(planned?.proceeds).toBe(4);
  });

  it("returns null without a pouch or with an empty pouch", () => {
    expect(
      planPortableSellerSale({
        characterId: CHARACTER_ID,
        catalog,
        items: baseItems().filter((item) => item.id !== POUCH_ID),
        bankBalance: 0,
      }),
    ).toBeNull();
    expect(
      planPortableSellerSale({
        characterId: CHARACTER_ID,
        catalog,
        items: baseItems(),
        bankBalance: 0,
      }),
    ).toBeNull();
  });

  it("refuses a sale that would overflow the bank cap", () => {
    const items = [...baseItems(), pouchChild(ID_A, SKULL_TYPE, 100, 0)];
    expect(
      planPortableSellerSale({
        characterId: CHARACTER_ID,
        catalog,
        items,
        bankBalance: BANK_LIMITS.maxBalance - 1,
      }),
    ).toBeNull();
  });
});
