import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "@tibia/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import type { Item } from "../../item/Item";
import { ItemCatalog } from "../../item/ItemCatalog";
import type { ItemType } from "../../item/ItemType";
import { planShopPurchase } from "./planShopPurchase";

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
  makeItemType({ id: SWORD, weight: 3500 }),
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
  stock?: { initial: number; remaining: number };
}) =>
  planShopPurchase({
    characterId: CHARACTER_ID,
    catalog,
    carried: {
      items: input.items,
      capacityMax: input.capacityMax ?? 400,
      bankBalance: input.bankBalance ?? 0,
    },
    npcTypeId: "npc-type",
    shopId: "shop",
    offerId: "offer",
    itemTypeId: input.itemTypeId ?? ROPE,
    amount: input.amount,
    unitPrice: input.unitPrice,
    ...(input.currencyItemTypeId === undefined
      ? {}
      : { currencyItemTypeId: input.currencyItemTypeId }),
    ...(input.stock === undefined ? {} : { stock: input.stock }),
  });

const unitsOf = (
  mutation: { after: ReadonlyArray<Item> },
  typeId: number,
): number =>
  mutation.after
    .filter((item) => item.typeId === typeId)
    .reduce((total, item) => total + item.count, 0);

describe("planShopPurchase", () => {
  beforeEach(() => {
    nextSlot = 0;
  });

  it("pays from carried coins and grants the goods", () => {
    const result = plan({
      items: [backpack, carriedItem("coin-1", GOLD_COIN_TYPE_ID, 100)],
      amount: 10,
      unitPrice: 5,
    });
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.bankSpent).toBe(0);
    expect(unitsOf(result.mutation, ROPE)).toBe(10);
    // 50 gold left the 100-coin stack, so the stack is written down to 50.
    const coins = result.mutation.after.find(
      (item) => item.id === "coin-1",
    );
    expect(coins?.count).toBe(50);
  });

  it("covers the shortfall from the bank and reports the new balance", () => {
    const result = plan({
      items: [backpack, carriedItem("coin-1", GOLD_COIN_TYPE_ID, 20)],
      amount: 10,
      unitPrice: 5,
      bankBalance: 1_000,
    });
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.bankSpent).toBe(30);
    expect(result.bankBalanceAfter).toBe(970);
    expect(result.persist.bankOps).toEqual([
      {
        characterId: CHARACTER_ID,
        delta: -30,
        expectedBalanceAfter: 970,
        ledger: "shop-purchase",
      },
    ]);
  });

  it("refuses when carried coins and the bank together fall short", () => {
    const result = plan({
      items: [backpack, carriedItem("coin-1", GOLD_COIN_TYPE_ID, 20)],
      amount: 10,
      unitPrice: 5,
      bankBalance: 29,
    });
    expect(result.status).toBe("insufficient-funds");
  });

  it("never plans a bank leg that would overdraw the balance", () => {
    const result = plan({
      items: [backpack],
      amount: 1,
      unitPrice: 100,
      bankBalance: 100,
    });
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.bankBalanceAfter).toBe(0);
    expect(result.persist.bankOps?.[0]?.delta).toBe(-100);
  });

  it("gives change when a large coin overpays", () => {
    const result = plan({
      items: [backpack, carriedItem("coin-1", PLATINUM_COIN_TYPE_ID, 1)],
      amount: 1,
      unitPrice: 30,
    });
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    // The platinum coin is consumed and 70 gold comes back as change.
    expect(result.mutation.removedItemIds).toContain("coin-1");
    expect(unitsOf(result.mutation, GOLD_COIN_TYPE_ID)).toBe(70);
  });

  it("rejects a purchase that would exceed carry capacity", () => {
    const result = plan({
      items: [backpack, carriedItem("coin-1", CRYSTAL_COIN_TYPE_ID, 10)],
      itemTypeId: SWORD,
      amount: 20,
      unitPrice: 1,
      capacityMax: 10,
    });
    expect(result.status).toBe("no-capacity");
  });

  it("rejects a purchase with no free slot for the goods", () => {
    const filled = Array.from({ length: 19 }, (_, index) =>
      carriedItem(`filler-${index}`, SWORD, 1, index + 1),
    );
    const result = plan({
      items: [
        backpack,
        carriedItem("coin-1", GOLD_COIN_TYPE_ID, 100, 0),
        ...filled,
      ],
      itemTypeId: SWORD,
      amount: 1,
      unitPrice: 1,
      capacityMax: 10_000,
    });
    expect(result.status).toBe("no-space");
  });

  it("fills the backpack first, then descends into bags inside bags", () => {
    const nested = (
      id: string,
      typeId: number,
      containerId: string,
      slot: number,
    ): Item => ({
      id,
      typeId,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId, slot },
    });
    const items: Item[] = [
      backpack,
      carriedItem("coin-1", GOLD_COIN_TYPE_ID, 100, 0),
      nested("bag-1", BACKPACK, BACKPACK_ID, 1),
      nested("bag-2", BACKPACK, "bag-1", 0),
    ];
    // Leave one free slot in the equipped backpack and none in bag-1.
    for (let slot = 2; slot < 19; slot++) {
      items.push(carriedItem(`filler-${slot}`, SWORD, 1, slot));
    }
    for (let slot = 1; slot < 20; slot++) {
      items.push(nested(`bag-1-filler-${slot}`, SWORD, "bag-1", slot));
    }

    const result = plan({
      items,
      itemTypeId: SWORD,
      amount: 3,
      unitPrice: 1,
      capacityMax: 1_000_000,
    });
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    const placed = result.mutation.after
      .filter((item) => item.typeId === SWORD && item.version === 1)
      .map((item) =>
        item.location.kind === "container" ? item.location.containerId : "?",
      );
    // One into the backpack's last free slot, then past the full bag-1 into
    // the bag nested inside it.
    expect(placed).toEqual([BACKPACK_ID, "bag-2", "bag-2"]);
  });

  it("spends a custom shop currency exactly and never the bank", () => {
    const result = plan({
      items: [backpack, carriedItem("token-1", TOKEN, 40)],
      amount: 2,
      unitPrice: 15,
      currencyItemTypeId: TOKEN,
      bankBalance: 10_000,
    });
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.bankSpent).toBe(0);
    expect(result.persist.bankOps).toBeUndefined();
    const tokens = result.mutation.after.find(
      (item) => item.id === "token-1",
    );
    expect(tokens?.count).toBe(10);
  });

  it("refuses a custom-currency purchase the bank cannot subsidise", () => {
    const result = plan({
      items: [backpack, carriedItem("token-1", TOKEN, 5)],
      amount: 1,
      unitPrice: 10,
      currencyItemTypeId: TOKEN,
      bankBalance: 1_000_000,
    });
    expect(result.status).toBe("insufficient-funds");
  });

  it("refuses to oversell finite stock and plans a guarded decrement", () => {
    const items = [backpack, carriedItem("coin-1", GOLD_COIN_TYPE_ID, 100)];
    expect(
      plan({ items, amount: 5, unitPrice: 1, stock: { initial: 10, remaining: 3 } })
        .status,
    ).toBe("out-of-stock");
    nextSlot = 0;
    const result = plan({
      items: [backpack, carriedItem("coin-2", GOLD_COIN_TYPE_ID, 100)],
      amount: 3,
      unitPrice: 1,
      stock: { initial: 10, remaining: 3 },
    });
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.stockRemaining).toBe(0);
    expect(result.persist.stockOps).toEqual([
      {
        shopId: "shop",
        offerId: "offer",
        initialStock: 10,
        amount: 3,
        expectedRemaining: 0,
      },
    ]);
  });

  it("audits the purchase so the economy event is written with it", () => {
    const result = plan({
      items: [backpack, carriedItem("coin-1", GOLD_COIN_TYPE_ID, 100)],
      amount: 4,
      unitPrice: 7,
    });
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.persist.audits).toEqual([
      {
        kind: "shop-purchase",
        npcTypeId: "npc-type",
        shopId: "shop",
        offerId: "offer",
        itemTypeId: ROPE,
        amount: 4,
        totalCost: 28,
        bankSpent: 0,
      },
    ]);
  });
});
