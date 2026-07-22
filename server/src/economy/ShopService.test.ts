import { PROTOCOL_LIMITS, type ServerMessage } from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { Npc } from "../creature/Npc";
import type { NpcType } from "../creature/NpcType";
import { gridMapData } from "../gridMapData";
import type { Item } from "../item/Item";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { Player } from "../Player";
import { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import type { ShopCatalog } from "./ShopCatalog";
import type { ShopStore } from "./ShopStore";
import { ShopService } from "./ShopService";

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const shopkeeperType: NpcType = {
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
      {
        id: "root",
        matches: [],
        responses: [],
        children: ["trade"],
        choices: [],
      },
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
};

const catalog: ShopCatalog = {
  id: "sam",
  npcTypeId: "sam",
  entries: [
    {
      offerId: "axe",
      itemTypeId: 3274,
      name: "axe",
      minimumAmount: 1,
      maximumAmount: 100,
      buyPrice: 20,
      sellPrice: 7,
    },
    {
      offerId: "battle-shield",
      itemTypeId: 3413,
      name: "battle shield",
      minimumAmount: 1,
      maximumAmount: 100,
      sellPrice: 95,
    },
  ],
};

const ownedAxe = (id: string, slot: number): Item => ({
  id,
  typeId: 3274,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: "test-backpack", slot },
});

const makeHarness = (
  store: Partial<ShopStore>,
  carried: Item[] = [],
  capacityMax = 400,
  shopCatalog: ShopCatalog = catalog,
) => {
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
  const applyCommittedMutation = vi.fn();
  const items = {
    applyCommittedMutation,
    trackExternalOperation: vi.fn(),
    inventorySnapshot: vi.fn(() => ({ items: carried, capacityMax })),
    itemType: vi.fn((typeId: number) => ({
      id: typeId,
      clientId: typeId,
      spriteId: 7_000 + typeId,
      name:
        typeId === 3274
          ? "axe"
          : typeId === 22516
            ? "silver token"
            : "battle shield",
      stackable: typeId === 22516,
      maxCount: typeId === 22516 ? 100 : 1,
      weight: typeId === 22516 ? 10 : 100,
      ...(typeId === 28552 ? { charges: 500 } : {}),
      render: {
        fluidContainer: false,
        splash: false,
      },
    })),
  } as unknown as ItemIntentHandler;
  const shops = new ShopService(
    world,
    items,
    new Map([[shopCatalog.id, shopCatalog]]),
    store as ShopStore,
  );
  return { world, player, npc, session, messages, shops, applyCommittedMutation };
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

describe("ShopService", () => {
  it("opens the shop with a server-owned projection", () => {
    const harness = makeHarness({});

    expect(harness.shops.open(harness.session, harness.npc, "sam", 1_000)).toBe(
      "opened",
    );
    const opened = harness.messages.find(
      (message) => message.type === "shop-opened",
    );
    expect(opened).toMatchObject({
      npcId: "npc-sam",
      shopId: "sam",
      currencyItemTypeId: 3031,
      currencyName: "gold",
      entries: [
        {
          itemTypeId: 3274,
          offerId: "axe",
          name: "axe",
          buyPrice: 20,
          sellPrice: 7,
        },
        { itemTypeId: 3413, name: "battle shield", sellPrice: 95 },
      ],
    });
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
    const purchase = vi.fn();
    const harness = makeHarness({ purchase }, [], 400, gatedCatalog);
    vi.spyOn(harness.player, "storageValue")
      .mockReturnValueOnce(2)
      .mockReturnValue(-1);
    const shopSessionId = openShop(harness);

    harness.shops.handle(harness.session, {
      type: "shop-buy",
      npcId: "npc-sam",
      shopSessionId,
      offerId: "axe",
      amount: 1,
    }, 1_001);

    expect(purchase).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "shop-action-failed",
      reason: "unavailable",
    });
  });

  it("uses a custom item currency resolved only from the server catalog", async () => {
    const tokenCatalog: ShopCatalog = {
      ...catalog,
      currencyItemTypeId: 22516,
      currencyName: "silver token",
      entries: [{ ...catalog.entries[0]!, sellPrice: undefined, buyPrice: 3 }],
    };
    const tokens: Item = {
      id: "tokens",
      typeId: 22516,
      count: 10,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: "test-backpack", slot: 0 },
    };
    const purchase = vi.fn(async () => ({
      status: "committed" as const,
      mutation: { after: [], removedItemIds: [] },
      bankSpent: 0,
    }));
    const harness = makeHarness({ purchase }, [tokens], 400, tokenCatalog);
    const shopSessionId = openShop(harness);
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "shop-opened",
        currencyItemTypeId: 22516,
        currencyName: "silver token",
        currencyAmount: 10,
      }),
    );

    harness.shops.handle(harness.session, {
      type: "shop-buy",
      npcId: "npc-sam",
      shopSessionId,
      offerId: "axe",
      amount: 2,
    }, 1_001);
    await nextTurn();
    harness.shops.applyResolvedOutcomes(1_002);

    expect(purchase).toHaveBeenCalledWith(
      harness.player.id,
      expect.objectContaining({
        totalCost: 6,
        currencyItemTypeId: 22516,
        currencyMaxCount: 100,
      }),
    );
  });

  it("refuses to open a shop the NPC does not own", () => {
    const harness = makeHarness({});

    expect(
      harness.shops.open(harness.session, harness.npc, "xodet", 1_000),
    ).toBe(
      "unavailable",
    );
  });

  it("does not open or replace a shop while another item operation is pending", () => {
    const harness = makeHarness({});
    harness.session.itemOperationPending = true;

    expect(harness.shops.open(harness.session, harness.npc, "sam", 1_000)).toBe(
      "unavailable",
    );
    expect(
      harness.messages.some((message) => message.type === "shop-opened"),
    ).toBe(false);
  });

  it("binds transactions to the opaque opened-shop session", () => {
    const purchase = vi.fn();
    const harness = makeHarness({ purchase });
    openShop(harness);

    harness.shops.handle(
      harness.session,
      {
        type: "shop-buy",
        npcId: "npc-sam",
        shopSessionId: "00000000-0000-4000-8000-000000000000",
        offerId: "axe",
        amount: 1,
      },
      1_001,
    );

    expect(purchase).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "shop-action-failed",
      reason: "unavailable",
    });
  });

  it("expires opened-shop authorization on the server clock", () => {
    const purchase = vi.fn();
    const harness = makeHarness({ purchase });
    const shopSessionId = openShop(harness);

    harness.shops.handle(
      harness.session,
      {
        type: "shop-buy",
        npcId: "npc-sam",
        shopSessionId,
        offerId: "axe",
        amount: 1,
      },
      31_000,
    );

    expect(purchase).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "shop-action-failed",
      reason: "unavailable",
    });
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
    const harness = makeHarness({}, [], 400, largeCatalog);

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

  it("resolves charged offers and amount bounds from the catalog", async () => {
    const chargedCatalog: ShopCatalog = {
      id: "sam",
      npcTypeId: "sam",
      entries: [
        {
          offerId: "exercise-sword",
          itemTypeId: 28552,
          name: "exercise sword",
          minimumAmount: 1,
          maximumAmount: 2,
          subtype: 500,
          buyPrice: 347_222,
        },
      ],
    };
    const purchase = vi.fn(async () => ({
      status: "committed" as const,
      mutation: { after: [], removedItemIds: [] },
      bankSpent: 347_222,
    }));
    const harness = makeHarness({ purchase }, [], 400, chargedCatalog);
    const shopSessionId = openShop(harness);

    harness.shops.handle(
      harness.session,
      {
        type: "shop-buy",
        npcId: "npc-sam",
        shopSessionId,
        offerId: "exercise-sword",
        amount: 3,
      },
      1_001,
    );
    expect(purchase).not.toHaveBeenCalled();

    harness.shops.handle(
      harness.session,
      {
        type: "shop-buy",
        npcId: "npc-sam",
        shopSessionId,
        offerId: "exercise-sword",
        amount: 1,
      },
      1_002,
    );
    await nextTurn();
    harness.shops.applyResolvedOutcomes(1_003);

    expect(purchase).toHaveBeenCalledWith(
      harness.player.id,
      expect.objectContaining({
        offerId: "exercise-sword",
        subtype: { kind: "charges", value: 500 },
      }),
    );
  });

  it("buys with server catalog prices, ignoring anything client-shaped", async () => {
    const purchase = vi.fn(async () => ({
      status: "committed" as const,
      mutation: { after: [], removedItemIds: [] },
      bankSpent: 0,
    }));
    const harness = makeHarness({ purchase });
    const shopSessionId = openShop(harness);

    harness.shops.handle(harness.session, {
      type: "shop-buy",
      npcId: "npc-sam",
      shopSessionId,
      offerId: "axe",
      amount: 3,
    }, 1_001);
    expect(harness.session.itemOperationPending).toBe(true);
    await nextTurn();
    harness.shops.applyResolvedOutcomes(1_000);

    expect(purchase).toHaveBeenCalledWith(harness.player.id, {
      npcTypeId: "sam",
      shopId: "sam",
      offerId: "axe",
      itemTypeId: 3274,
      amount: 3,
      unitPrice: 20,
      totalCost: 60,
      stackable: false,
      maxCount: 1,
    });
    expect(harness.session.itemOperationPending).toBe(false);
    expect(harness.applyCommittedMutation).toHaveBeenCalledOnce();
    expect(harness.messages).toContainEqual({
      type: "shop-transacted",
      kind: "purchase",
      offerId: "axe",
      itemTypeId: 3274,
      name: "axe",
      amount: 3,
      totalPrice: 60,
    });
  });

  it("does not clear or message a different character when a result arrives late", async () => {
    const purchase = vi.fn(async () => ({
      status: "committed" as const,
      mutation: { after: [], removedItemIds: [] },
      bankSpent: 0,
    }));
    const harness = makeHarness({ purchase });
    const shopSessionId = openShop(harness);

    harness.shops.handle(
      harness.session,
      {
        type: "shop-buy",
        npcId: "npc-sam",
        shopSessionId,
        offerId: "axe",
        amount: 1,
      },
      1_001,
    );
    harness.session.playerId = "different-character";
    harness.session.itemOperationPending = true;
    await nextTurn();
    harness.shops.applyResolvedOutcomes(1_002);

    expect(harness.applyCommittedMutation).toHaveBeenCalledOnce();
    expect(harness.session.itemOperationPending).toBe(true);
    expect(
      harness.messages.some((message) => message.type === "shop-transacted"),
    ).toBe(false);
  });

  it("rejects buying an entry the shop does not sell", () => {
    const purchase = vi.fn();
    const harness = makeHarness({ purchase });
    const shopSessionId = openShop(harness);

    harness.shops.handle(harness.session, {
      type: "shop-buy",
      npcId: "npc-sam",
      shopSessionId,
      offerId: "battle-shield",
      amount: 1,
    }, 1_001);

    expect(purchase).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "shop-action-failed",
      reason: "invalid-item",
    });
  });

  it("rejects intents out of talk range at execution time", () => {
    const purchase = vi.fn();
    const harness = makeHarness({ purchase });
    const shopSessionId = openShop(harness);
    harness.world.relocateCreature(harness.player, { x: 30, y: 30, z: 7 });

    harness.shops.handle(harness.session, {
      type: "shop-buy",
      npcId: "npc-sam",
      shopSessionId,
      offerId: "axe",
      amount: 1,
    }, 1_001);

    expect(purchase).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "shop-action-failed",
      reason: "out-of-range",
    });
  });

  it("rejects a purchase that exceeds carrying capacity before the store", () => {
    const purchase = vi.fn();
    const heavy = Array.from({ length: 100 }, (_, slot) => ({
      ...ownedAxe(`axe-${slot}`, slot),
      count: 1,
    }));
    const harness = makeHarness({ purchase }, heavy, 100);
    const shopSessionId = openShop(harness);

    harness.shops.handle(harness.session, {
      type: "shop-buy",
      npcId: "npc-sam",
      shopSessionId,
      offerId: "axe",
      amount: 100,
    }, 1_001);

    expect(purchase).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "shop-action-failed",
      reason: "no-capacity",
    });
  });

  it("rejects selling more than the player carries before the store", () => {
    const sell = vi.fn();
    const harness = makeHarness({ sell }, [ownedAxe("axe-1", 0)]);
    const shopSessionId = openShop(harness);

    harness.shops.handle(harness.session, {
      type: "shop-sell",
      npcId: "npc-sam",
      shopSessionId,
      offerId: "axe",
      amount: 2,
    }, 1_001);

    expect(sell).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "shop-action-failed",
      reason: "not-owned",
    });
  });

  it("sells with the server catalog price", async () => {
    const sell = vi.fn(async () => ({
      status: "committed" as const,
      mutation: { after: [], removedItemIds: ["axe-1"] },
    }));
    const harness = makeHarness({ sell }, [
      ownedAxe("axe-1", 0),
      ownedAxe("axe-2", 1),
    ]);
    const shopSessionId = openShop(harness);

    harness.shops.handle(harness.session, {
      type: "shop-sell",
      npcId: "npc-sam",
      shopSessionId,
      offerId: "axe",
      amount: 2,
    }, 1_001);
    await nextTurn();
    harness.shops.applyResolvedOutcomes(1_000);

    expect(sell).toHaveBeenCalledWith(harness.player.id, {
      npcTypeId: "sam",
      shopId: "sam",
      offerId: "axe",
      itemTypeId: 3274,
      amount: 2,
      unitPrice: 7,
      totalProceeds: 14,
    });
    expect(harness.messages).toContainEqual({
      type: "shop-transacted",
      kind: "sale",
      offerId: "axe",
      itemTypeId: 3274,
      name: "axe",
      amount: 2,
      totalPrice: 14,
    });
  });

  it("reports store failures without leaking details", async () => {
    const purchase = vi.fn(async () => {
      throw new Error("database exploded");
    });
    const harness = makeHarness({ purchase });
    const shopSessionId = openShop(harness);

    harness.shops.handle(harness.session, {
      type: "shop-buy",
      npcId: "npc-sam",
      shopSessionId,
      offerId: "axe",
      amount: 1,
    }, 1_001);
    await nextTurn();
    harness.shops.applyResolvedOutcomes(1_000);

    expect(harness.session.itemOperationPending).toBe(false);
    expect(harness.messages).toContainEqual({
      type: "shop-action-failed",
      reason: "failed",
    });
    expect(
      harness.messages.some((message) =>
        JSON.stringify(message).includes("exploded"),
      ),
    ).toBe(false);
  });
});
