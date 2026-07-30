import {
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
  PROTOCOL_LIMITS,
  SHOP_LIMITS,
  type ServerMessage,
} from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { Npc } from "../creature/Npc";
import type { NpcType } from "../creature/NpcType";
import { gridMapData } from "../gridMapData";
import type { Item } from "../item/Item";
import { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { ItemType } from "../item/ItemType";
import { Player } from "../Player";
import { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import { makeNpcType } from "../test/makeNpcType";
import { World } from "../World";
import type { EconomyPersistPlan } from "./EconomyPersistPlan";
import type { ShopCatalog } from "./ShopCatalog";
import { ShopService } from "./ShopService";
import { ShopStockCache } from "./ShopStockCache";

const BACKPACK_TYPE = 1988;
const AXE = 3274;
const BATTLE_SHIELD = 3413;
const SILVER_TOKEN = 22516;
const EXERCISE_SWORD = 28552;
const BACKPACK_ID = "test-backpack";

const makeItemType = (
  overrides: Partial<ItemType> & { id: number },
): ItemType => ({
  clientId: overrides.id,
  name: `type-${overrides.id}`,
  spriteId: 7_000 + overrides.id,
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

const coinType = (id: number): ItemType =>
  makeItemType({ id, stackable: true, maxCount: 100, weight: 10 });

const itemCatalog = new ItemCatalog([
  makeItemType({
    id: BACKPACK_TYPE,
    equipmentSlot: "backpack",
    containerCapacity: 20,
    weight: 180,
  }),
  makeItemType({ id: AXE, name: "axe", weight: 100 }),
  makeItemType({ id: BATTLE_SHIELD, name: "battle shield" }),
  makeItemType({
    id: SILVER_TOKEN,
    name: "silver token",
    stackable: true,
    maxCount: 100,
    weight: 10,
  }),
  makeItemType({ id: EXERCISE_SWORD, name: "exercise sword", charges: 500 }),
  coinType(GOLD_COIN_TYPE_ID),
  coinType(PLATINUM_COIN_TYPE_ID),
  // The pagination catalog spans a contiguous block of ids.
  ...Array.from({ length: 100 }, (_, index) =>
    makeItemType({ id: 10_000 + index }),
  ),
]);

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const shopkeeperType: NpcType = makeNpcType({
  id: "sam",
  name: "Sam",
  outfit: { lookType: 129, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
  health: 100,
  maxHealth: 100,
  speed: 100,
  walkIntervalMs: 2_000,
  walkRadius: 2,
  dialogue: {
    talkRange: 4,
    timeoutMs: 30_000,
    greetingKeywords: ["hi"],
    farewellKeywords: ["bye"],
    greeting: ["Hello."],
    farewell: ["Bye."],
    walkAway: ["Bye."],
    rootNodeId: "root",
    nodes: [
      { id: "root", matches: [], responses: [], children: ["trade"], choices: [] },
      {
        id: "trade",
        matches: [["trade"]],
        responses: ["Take a look."],
        children: [],
        choices: [],
        nextNodeId: "root",
        action: { kind: "shop", shopId: "sam" },
      },
    ],
    travelOffers: [],
  },
});

const catalog: ShopCatalog = {
  id: "sam",
  npcTypeId: "sam",
  entries: [
    {
      offerId: "axe",
      itemTypeId: AXE,
      name: "axe",
      minimumAmount: 1,
      maximumAmount: 100,
      buyPrice: 20,
      sellPrice: 7,
    },
    {
      offerId: "battle-shield",
      itemTypeId: BATTLE_SHIELD,
      name: "battle shield",
      minimumAmount: 1,
      maximumAmount: 100,
      sellPrice: 95,
    },
  ],
};

const backpack: Item = {
  id: BACKPACK_ID,
  typeId: BACKPACK_TYPE,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "equipment", characterId: "shopper", slot: "backpack" },
};

const carriedRow = (
  id: string,
  typeId: number,
  count: number,
  slot: number,
): Item => ({
  id,
  typeId,
  count,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: BACKPACK_ID, slot },
});

const ownedAxe = (id: string, slot: number): Item => carriedRow(id, AXE, 1, slot);

const gold = (count: number, slot = 19): Item =>
  carriedRow("gold-stack", GOLD_COIN_TYPE_ID, count, slot);

const makeHarness = (options?: {
  carried?: Item[];
  capacityMax?: number;
  shopCatalog?: ShopCatalog;
  bankBalance?: number;
  stock?: ShopStockCache;
  persistFails?: boolean;
}) => {
  const shopCatalog = options?.shopCatalog ?? catalog;
  const world = new World(
    gridMapData({
      name: "shop-test",
      width: 40,
      height: 40,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const player = new Player(makeCharacter("shopper", "Shopper"), {
    x: 10,
    y: 10,
    z: 7,
  });
  const npc = new Npc({
    id: "npc-sam",
    type: shopkeeperType,
    position: { x: 10, y: 12, z: 7 },
    direction: "south",
    home: { x: 10, y: 12, z: 7 },
    spawnRadius: 2,
  });
  world.addPlayer(player);
  world.addCreature(npc);
  const messages: ServerMessage[] = [];
  const socket = {
    on: vi.fn(),
    readyState: 1,
    OPEN: 1,
    send: (data: string) => messages.push(JSON.parse(data) as ServerMessage),
  } as unknown as WebSocket;
  const session = new Session("session", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = player.id;
  session.knownCreatureIds.add(npc.id);

  let items: ReadonlyArray<Item> = options?.carried ?? [backpack];
  let bankBalance = options?.bankBalance ?? 0;
  const applyCommittedMutation = vi.fn();
  const persisted: EconomyPersistPlan[] = [];
  const writes: Promise<void>[] = [];
  const persist = vi.fn(async (plan: EconomyPersistPlan) => {
    if (options?.persistFails) throw new Error("database exploded");
    persisted.push(plan);
  });
  const handler = {
    applyCommittedMutation,
    inventorySnapshot: vi.fn(() => ({
      items,
      capacityMax: options?.capacityMax ?? 400,
      bankBalance,
    })),
    setBankBalance: vi.fn((_characterId: string, balance: number) => {
      bankBalance = balance;
    }),
    enqueuePersist: vi.fn(
      (_session: Session, _characterId: string, run: () => Promise<void>) => {
        writes.push(run());
      },
    ),
    itemType: vi.fn((typeId: number) => itemCatalog.get(typeId)),
  } as unknown as ItemIntentHandler;

  const shops = new ShopService(
    world,
    handler,
    new Map([[shopCatalog.id, shopCatalog]]),
    itemCatalog,
    options?.stock ?? new ShopStockCache(),
    { persist },
  );
  return {
    world,
    player,
    npc,
    session,
    messages,
    shops,
    applyCommittedMutation,
    persist,
    persisted,
    handler,
    settleWrites: async () => {
      await Promise.allSettled(writes);
    },
    bankBalance: () => bankBalance,
  };
};

const openShop = (
  harness: ReturnType<typeof makeHarness>,
  now = 1_000,
): string => {
  expect(harness.shops.open(harness.session, harness.npc, "sam", now)).toBe(
    "opened",
  );
  const opened = harness.messages.find(
    (message) => message.type === "shop-opened",
  );
  if (!opened || opened.type !== "shop-opened") {
    throw new Error("shop did not open");
  }
  return opened.shopSessionId;
};

const buy = (
  harness: ReturnType<typeof makeHarness>,
  shopSessionId: string,
  amount: number,
  now: number,
  offerId = "axe",
) =>
  harness.shops.handle(
    harness.session,
    { type: "shop-buy", npcId: "npc-sam", shopSessionId, offerId, amount },
    now,
  );

const sell = (
  harness: ReturnType<typeof makeHarness>,
  shopSessionId: string,
  amount: number,
  now: number,
  offerId = "axe",
) =>
  harness.shops.handle(
    harness.session,
    { type: "shop-sell", npcId: "npc-sam", shopSessionId, offerId, amount },
    now,
  );

const failures = (harness: ReturnType<typeof makeHarness>) =>
  harness.messages.filter((message) => message.type === "shop-action-failed");

describe("ShopService", () => {
  it("opens the shop with a server-owned projection", () => {
    const harness = makeHarness({ bankBalance: 500 });

    expect(harness.shops.open(harness.session, harness.npc, "sam", 1_000)).toBe(
      "opened",
    );
    expect(
      harness.messages.find((message) => message.type === "shop-opened"),
    ).toMatchObject({
      npcId: "npc-sam",
      shopId: "sam",
      currencyItemTypeId: GOLD_COIN_TYPE_ID,
      currencyName: "gold",
      bankBalance: 500,
      entries: [
        { itemTypeId: AXE, offerId: "axe", buyPrice: 20, sellPrice: 7 },
        { itemTypeId: BATTLE_SHIELD, sellPrice: 95 },
      ],
    });
  });

  it("projects how many of each offer the player can sell", () => {
    const equipped: Item = {
      id: "axe-worn",
      typeId: AXE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "equipment", characterId: "shopper", slot: "weapon" },
    };
    const harness = makeHarness({
      carried: [backpack, ownedAxe("axe-1", 0), ownedAxe("axe-2", 1), equipped],
    });

    openShop(harness);

    const opened = harness.messages.find(
      (message) => message.type === "shop-opened",
    );
    if (!opened || opened.type !== "shop-opened") throw new Error("not opened");
    // The two loose axes count; the equipped one is never sellable.
    expect(
      opened.entries.find((entry) => entry.offerId === "axe")?.owned,
    ).toBe(2);
    // An offer the shop does not buy back reports nothing to sell.
    expect(
      opened.entries.find((entry) => entry.offerId === "battle-shield")?.owned,
    ).toBe(0);
  });

  it("buys instantly in the same tick, with no wait on the write", () => {
    const harness = makeHarness({ carried: [backpack, gold(100)] });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 3, 1_001);

    expect(harness.applyCommittedMutation).toHaveBeenCalledOnce();
    expect(harness.messages).toContainEqual({
      type: "shop-transacted",
      kind: "purchase",
      offerId: "axe",
      itemTypeId: AXE,
      name: "axe",
      amount: 3,
      totalPrice: 60,
    });
    // Nothing blocks the next purchase: the write is queued, not awaited.
    expect(harness.session.itemOperationPending).toBe(false);
  });

  it("lets a player keep buying without a busy error once the exhaust clears", () => {
    const harness = makeHarness({ carried: [backpack, gold(100)] });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 1, 1_001);
    buy(harness, shopSessionId, 1, 1_001 + SHOP_LIMITS.exhaustMs);
    buy(harness, shopSessionId, 1, 1_001 + SHOP_LIMITS.exhaustMs * 2);

    expect(
      harness.messages.filter((message) => message.type === "shop-transacted"),
    ).toHaveLength(3);
    expect(failures(harness)).toEqual([]);
  });

  it("refuses a second buy inside the exhaust window", () => {
    const harness = makeHarness({ carried: [backpack, gold(100)] });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 1, 1_001);
    buy(harness, shopSessionId, 1, 1_001 + SHOP_LIMITS.exhaustMs - 1);

    expect(
      harness.messages.filter((message) => message.type === "shop-transacted"),
    ).toHaveLength(1);
    expect(failures(harness)).toEqual([
      { type: "shop-action-failed", reason: "busy" },
    ]);
  });

  it("commits the item, money and audit legs in one queued transaction", async () => {
    const harness = makeHarness({
      carried: [backpack, gold(10)],
      bankBalance: 1_000,
    });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 1, 1_001);
    await harness.settleWrites();

    expect(harness.persist).toHaveBeenCalledOnce();
    const plan = harness.persisted[0];
    expect(plan?.carried.characterId).toBe(harness.player.id);
    expect(plan?.bankOps).toEqual([
      {
        characterId: harness.player.id,
        delta: -10,
        expectedBalanceAfter: 990,
        ledger: "shop-purchase",
      },
    ]);
    expect(plan?.audits).toEqual([
      expect.objectContaining({
        kind: "shop-purchase",
        totalCost: 20,
        bankSpent: 10,
      }),
    ]);
  });

  it("spends carried coins first and the bank for the shortfall", () => {
    const harness = makeHarness({
      carried: [backpack, gold(10)],
      bankBalance: 1_000,
    });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 1, 1_001);

    expect(harness.bankBalance()).toBe(990);
    expect(harness.messages).toContainEqual({
      type: "bank-updated",
      balance: 990,
    });
  });

  it("refuses when carried coins and the bank together fall short", () => {
    const harness = makeHarness({
      carried: [backpack, gold(5)],
      bankBalance: 10,
    });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 1, 1_001);

    expect(harness.persist).not.toHaveBeenCalled();
    expect(failures(harness)).toEqual([
      { type: "shop-action-failed", reason: "insufficient-funds" },
    ]);
  });

  it("leaves the balance untouched when no bank money is spent", () => {
    const harness = makeHarness({
      carried: [backpack, gold(100)],
      bankBalance: 700,
    });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 1, 1_001);

    expect(harness.bankBalance()).toBe(700);
    expect(
      harness.messages.some((message) => message.type === "bank-updated"),
    ).toBe(false);
    expect(harness.persisted[0]?.bankOps).toBeUndefined();
  });

  it("filters storage-gated offers and re-checks the gate at execution", () => {
    const gatedCatalog: ShopCatalog = {
      id: "sam",
      npcTypeId: "sam",
      entries: [
        {
          ...catalog.entries[0]!,
          availability: [
            { kind: "storage-at-least", key: "Quest.Example", value: 2 },
          ],
        },
      ],
    };
    const harness = makeHarness({
      carried: [backpack, gold(100)],
      shopCatalog: gatedCatalog,
    });
    vi.spyOn(harness.player, "storageValue")
      .mockReturnValueOnce(2)
      .mockReturnValue(-1);
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 1, 1_001);

    expect(harness.persist).not.toHaveBeenCalled();
    expect(failures(harness)).toEqual([
      { type: "shop-action-failed", reason: "unavailable" },
    ]);
  });

  it("uses a custom item currency resolved only from the server catalog", () => {
    const tokenCatalog: ShopCatalog = {
      ...catalog,
      currencyItemTypeId: SILVER_TOKEN,
      currencyName: "silver token",
      entries: [{ ...catalog.entries[0]!, sellPrice: undefined, buyPrice: 3 }],
    };
    const harness = makeHarness({
      carried: [backpack, carriedRow("tokens", SILVER_TOKEN, 10, 0)],
      shopCatalog: tokenCatalog,
      bankBalance: 10_000,
    });
    const shopSessionId = openShop(harness);
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "shop-opened",
        currencyItemTypeId: SILVER_TOKEN,
        currencyName: "silver token",
        currencyAmount: 10,
      }),
    );

    buy(harness, shopSessionId, 2, 1_001);

    // Tokens only: a custom currency is never subsidised from the bank.
    expect(harness.bankBalance()).toBe(10_000);
    expect(harness.persisted[0]?.bankOps).toBeUndefined();
    expect(harness.messages).toContainEqual(
      expect.objectContaining({ type: "shop-transacted", totalPrice: 6 }),
    );
  });

  it("refuses to open a shop the NPC does not own", () => {
    const harness = makeHarness();

    expect(
      harness.shops.open(harness.session, harness.npc, "xodet", 1_000),
    ).toBe("unavailable");
  });

  it("does not open or replace a shop while a DB-first operation is pending", () => {
    const harness = makeHarness();
    harness.session.itemOperationPending = true;

    expect(harness.shops.open(harness.session, harness.npc, "sam", 1_000)).toBe(
      "unavailable",
    );
    expect(
      harness.messages.some((message) => message.type === "shop-opened"),
    ).toBe(false);
  });

  it("refuses a purchase while a DB-first operation holds the inventory", () => {
    const harness = makeHarness({ carried: [backpack, gold(100)] });
    const shopSessionId = openShop(harness);
    harness.session.itemOperationPending = true;

    buy(harness, shopSessionId, 1, 1_001);

    expect(harness.persist).not.toHaveBeenCalled();
    expect(failures(harness)).toEqual([
      { type: "shop-action-failed", reason: "busy" },
    ]);
  });

  it("binds transactions to the opaque opened-shop session", () => {
    const harness = makeHarness({ carried: [backpack, gold(100)] });
    openShop(harness);

    buy(harness, "00000000-0000-4000-8000-000000000000", 1, 1_001);

    expect(harness.persist).not.toHaveBeenCalled();
    expect(failures(harness)).toEqual([
      { type: "shop-action-failed", reason: "unavailable" },
    ]);
  });

  it("expires opened-shop authorization on the server clock", () => {
    const harness = makeHarness({ carried: [backpack, gold(100)] });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 1, 31_000);

    expect(harness.persist).not.toHaveBeenCalled();
    expect(failures(harness)).toEqual([
      { type: "shop-action-failed", reason: "unavailable" },
    ]);
  });

  it("paginates large catalogs below the transport payload limit", () => {
    const largeCatalog: ShopCatalog = {
      id: "sam",
      npcTypeId: "sam",
      entries: Array.from({ length: 100 }, (_, index) => ({
        offerId: `offer-${index + 1}`,
        itemTypeId: 10_000 + index,
        name: `catalog item ${index + 1} ${"x".repeat(80)}`,
        minimumAmount: 1,
        maximumAmount: 100,
        buyPrice: index + 1,
      })),
    };
    const harness = makeHarness({ shopCatalog: largeCatalog });

    expect(harness.shops.open(harness.session, harness.npc, "sam", 1_000)).toBe(
      "opened",
    );
    const pages = harness.messages.filter(
      (message) => message.type === "shop-opened",
    );

    expect(pages.length).toBeGreaterThan(1);
    expect(
      pages.every(
        (message) =>
          Buffer.byteLength(JSON.stringify(message)) <=
          PROTOCOL_LIMITS.maxMessageBytes,
      ),
    ).toBe(true);
    expect(
      pages.reduce(
        (total, message) =>
          total + (message.type === "shop-opened" ? message.entries.length : 0),
        0,
      ),
    ).toBe(100);
  });

  it("resolves charged offers and amount bounds from the catalog", () => {
    const chargedCatalog: ShopCatalog = {
      id: "sam",
      npcTypeId: "sam",
      entries: [
        {
          offerId: "exercise-sword",
          itemTypeId: EXERCISE_SWORD,
          name: "exercise sword",
          minimumAmount: 1,
          maximumAmount: 2,
          subtype: 500,
          buyPrice: 100,
        },
      ],
    };
    const harness = makeHarness({
      carried: [backpack, gold(100)],
      shopCatalog: chargedCatalog,
      bankBalance: 10_000,
    });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 3, 1_001, "exercise-sword");
    expect(failures(harness)).toEqual([
      { type: "shop-action-failed", reason: "invalid-item" },
    ]);

    buy(harness, shopSessionId, 1, 1_002 + SHOP_LIMITS.exhaustMs, "exercise-sword");

    expect(harness.persisted[0]?.audits).toEqual([
      expect.objectContaining({ offerId: "exercise-sword", subtype: 500 }),
    ]);
  });

  it("rejects buying an entry the shop does not sell", () => {
    const harness = makeHarness({ carried: [backpack, gold(100)] });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 1, 1_001, "battle-shield");

    expect(harness.persist).not.toHaveBeenCalled();
    expect(failures(harness)).toEqual([
      { type: "shop-action-failed", reason: "invalid-item" },
    ]);
  });

  it("rejects intents out of talk range at execution time", () => {
    const harness = makeHarness({ carried: [backpack, gold(100)] });
    const shopSessionId = openShop(harness);
    harness.world.relocateCreature(harness.player, { x: 30, y: 30, z: 7 });

    buy(harness, shopSessionId, 1, 1_001);

    expect(harness.persist).not.toHaveBeenCalled();
    expect(failures(harness)).toEqual([
      { type: "shop-action-failed", reason: "out-of-range" },
    ]);
  });

  it("rejects a purchase that exceeds carrying capacity", () => {
    const harness = makeHarness({
      carried: [backpack, gold(100)],
      capacityMax: 3,
    });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 5, 1_001);

    expect(harness.persist).not.toHaveBeenCalled();
    expect(failures(harness)).toEqual([
      { type: "shop-action-failed", reason: "no-capacity" },
    ]);
  });

  it("rejects selling more than the player carries", () => {
    const harness = makeHarness({ carried: [backpack, ownedAxe("axe-1", 0)] });
    const shopSessionId = openShop(harness);

    sell(harness, shopSessionId, 2, 1_001);

    expect(harness.persist).not.toHaveBeenCalled();
    expect(failures(harness)).toEqual([
      { type: "shop-action-failed", reason: "not-owned" },
    ]);
  });

  it("sells with the server catalog price", () => {
    const harness = makeHarness({
      carried: [backpack, ownedAxe("axe-1", 0), ownedAxe("axe-2", 1)],
    });
    const shopSessionId = openShop(harness);

    sell(harness, shopSessionId, 2, 1_001);

    expect(harness.messages).toContainEqual({
      type: "shop-transacted",
      kind: "sale",
      offerId: "axe",
      itemTypeId: AXE,
      name: "axe",
      amount: 2,
      totalPrice: 14,
    });
    expect(harness.persisted[0]?.audits).toEqual([
      expect.objectContaining({ kind: "shop-sale", totalProceeds: 14 }),
    ]);
  });

  it("refuses to oversell finite stock across repeated purchases", () => {
    const stock = new ShopStockCache();
    const stockedCatalog: ShopCatalog = {
      id: "sam",
      npcTypeId: "sam",
      entries: [{ ...catalog.entries[0]!, stock: 2 }],
    };
    stock.seed(new Map([["sam", stockedCatalog]]), []);
    const harness = makeHarness({
      carried: [backpack, gold(100)],
      shopCatalog: stockedCatalog,
      stock,
    });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 2, 1_001);
    expect(harness.messages).toContainEqual(
      expect.objectContaining({ type: "shop-transacted", amount: 2 }),
    );

    // The mirror is now empty, so the next purchase is refused in the tick.
    buy(harness, shopSessionId, 1, 1_001 + SHOP_LIMITS.exhaustMs);

    expect(failures(harness)).toEqual([
      { type: "shop-action-failed", reason: "out-of-stock" },
    ]);
  });

  it("reports a failed write without leaking details", async () => {
    const harness = makeHarness({
      carried: [backpack, gold(100)],
      persistFails: true,
    });
    const shopSessionId = openShop(harness);

    buy(harness, shopSessionId, 1, 1_001);
    await nextTurn();
    await harness.settleWrites();

    expect(
      harness.messages.some((message) =>
        JSON.stringify(message).includes("exploded"),
      ),
    ).toBe(false);
  });
});
