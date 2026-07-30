import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "@tibia/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import type { Item } from "../../item/Item";
import { ItemCatalog } from "../../item/ItemCatalog";
import type { ItemType } from "../../item/ItemType";
import { planShopSale } from "./planShopSale";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BACKPACK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const BACKPACK = 1988;
const SWORD = 3264;
const ROPE = 3003;
const TOKEN = 5555;

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

const catalog = new ItemCatalog([
  makeItemType({
    id: BACKPACK,
    equipmentSlot: "backpack",
    containerCapacity: 20,
    weight: 180,
  }),
  makeItemType({ id: SWORD, weight: 100, equipmentSlot: "weapon" }),
  makeItemType({ id: ROPE, stackable: true, maxCount: 100, weight: 20 }),
  makeItemType({ id: TOKEN, stackable: true, maxCount: 100, weight: 0 }),
  makeItemType({
    id: GOLD_COIN_TYPE_ID,
    stackable: true,
    maxCount: 100,
    weight: 10,
  }),
  makeItemType({
    id: PLATINUM_COIN_TYPE_ID,
    stackable: true,
    maxCount: 100,
    weight: 10,
  }),
  makeItemType({
    id: CRYSTAL_COIN_TYPE_ID,
    stackable: true,
    maxCount: 100,
    weight: 10,
  }),
]);

const backpack: Item = {
  id: BACKPACK_ID,
  typeId: BACKPACK,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "equipment", characterId: CHARACTER_ID, slot: "backpack" },
};

let nextSlot = 0;
const carriedItem = (
  id: string,
  typeId: number,
  count: number,
  slot = nextSlot++,
): Item => ({
  id,
  typeId,
  count,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: BACKPACK_ID, slot },
});

const plan = (input: {
  items: ReadonlyArray<Item>;
  amount: number;
  unitPrice: number;
  itemTypeId?: number;
  bankBalance?: number;
  capacityMax?: number;
  currencyItemTypeId?: number;
}) =>
  planShopSale({
    characterId: CHARACTER_ID,
    catalog,
    carried: {
      items: input.items,
      capacityMax: input.capacityMax ?? 10_000,
      bankBalance: input.bankBalance ?? 0,
    },
    npcTypeId: "npc-type",
    shopId: "shop",
    offerId: "offer",
    itemTypeId: input.itemTypeId ?? SWORD,
    amount: input.amount,
    unitPrice: input.unitPrice,
    ...(input.currencyItemTypeId === undefined
      ? {}
      : { currencyItemTypeId: input.currencyItemTypeId }),
  });

const unitsOf = (
  mutation: { after: ReadonlyArray<Item> },
  typeId: number,
): number =>
  mutation.after
    .filter((item) => item.typeId === typeId)
    .reduce((total, item) => total + item.count, 0);

describe("planShopSale", () => {
  beforeEach(() => {
    nextSlot = 0;
  });

  it("removes the goods and pays coins", () => {
    const result = plan({
      items: [backpack, carriedItem("sword-1", SWORD, 1)],
      amount: 1,
      unitPrice: 40,
    });
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.mutation.removedItemIds).toContain("sword-1");
    expect(unitsOf(result.mutation, GOLD_COIN_TYPE_ID)).toBe(40);
    expect(result.bankCredited).toBe(0);
  });

  it("refuses to sell more than the player owns", () => {
    const result = plan({
      items: [backpack, carriedItem("sword-1", SWORD, 1)],
      amount: 2,
      unitPrice: 40,
    });
    expect(result.status).toBe("not-owned");
  });

  it("never sells an equipped item", () => {
    const equipped: Item = {
      id: "sword-worn",
      typeId: SWORD,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "equipment",
        characterId: CHARACTER_ID,
        slot: "weapon",
      },
    };
    const result = plan({ items: [backpack, equipped], amount: 1, unitPrice: 40 });
    expect(result.status).toBe("not-owned");
  });

  it("never sells a container that still holds items", () => {
    const bag: Item = {
      id: "bag-1",
      typeId: BACKPACK,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
    };
    const inside: Item = {
      id: "rope-1",
      typeId: ROPE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: "bag-1", slot: 0 },
    };
    const result = plan({
      items: [backpack, bag, inside],
      itemTypeId: BACKPACK,
      amount: 1,
      unitPrice: 10,
    });
    expect(result.status).toBe("not-owned");
  });

  it("banks proceeds that will not fit and reports the new balance", () => {
    // The backpack is full, so freeing the sword's slot leaves exactly one:
    // the crystal coins take it and the platinum has nowhere to go.
    const fillers = Array.from({ length: 19 }, (_, index) =>
      carriedItem(`filler-${index}`, ROPE, 1, index + 1),
    );
    const result = plan({
      items: [backpack, carriedItem("sword-1", SWORD, 1, 0), ...fillers],
      amount: 1,
      unitPrice: 25_000,
      bankBalance: 500,
    });
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(unitsOf(result.mutation, CRYSTAL_COIN_TYPE_ID)).toBe(2);
    expect(result.bankCredited).toBe(5_000);
    expect(result.bankBalanceAfter).toBe(5_500);
    expect(result.persist.bankOps).toEqual([
      {
        characterId: CHARACTER_ID,
        delta: 5_000,
        expectedBalanceAfter: 5_500,
        ledger: "shop-sale",
      },
    ]);
  });

  it("keeps a custom shop currency all-or-nothing", () => {
    const fillers = Array.from({ length: 20 }, (_, index) =>
      carriedItem(`filler-${index}`, ROPE, 1, index),
    );
    const nested: Item = {
      id: "sword-1",
      typeId: SWORD,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: "filler-0", slot: 0 },
    };
    const result = plan({
      items: [backpack, ...fillers, nested],
      amount: 1,
      unitPrice: 10,
      currencyItemTypeId: TOKEN,
    });
    expect(result.status).toBe("no-space");
  });

  it("audits the sale so the economy event is written with it", () => {
    const result = plan({
      items: [backpack, carriedItem("sword-1", SWORD, 1)],
      amount: 1,
      unitPrice: 40,
    });
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.persist.audits).toEqual([
      {
        kind: "shop-sale",
        npcTypeId: "npc-type",
        shopId: "shop",
        offerId: "offer",
        itemTypeId: SWORD,
        amount: 1,
        totalProceeds: 40,
        bankCredited: 0,
      },
    ]);
  });
});
