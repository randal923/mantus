import { randomUUID } from "node:crypto";
import type { AccountTier, ServerMessage } from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { gridMapData } from "../gridMapData";
import type { Item } from "../item/Item";
import { ItemCatalog } from "../item/ItemCatalog";
import { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { ItemType } from "../item/ItemType";
import { MemoryItemStore } from "../item/MemoryItemStore";
import type { MapData } from "../MapData";
import type { MapItem } from "../MapItem";
import { Player } from "../Player";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { DepotService } from "./../depot/DepotService";
import type { DepotStore } from "../depot/DepotStore";
import { MarketService } from "./MarketService";
import type { MarketStore } from "./MarketStore";

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const depotPosition = { x: 11, y: 10, z: 7 } as const;
const GEM_TYPE = 675;
const JUNK_TYPE = 999;

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
    id: GEM_TYPE,
    name: "small enchanted sapphire",
    primaryType: "valuables",
    stackable: true,
    maxCount: 100,
  }),
  // No primaryType mapping: not marketable.
  makeItemType({ id: JUNK_TYPE, name: "worthless blob" }),
]);

const mapDepot = (depotId: number): MapItem => ({
  instanceId: `depot-${depotId}`,
  itemId: 3497,
  stackIndex: 1,
  mutable: false,
  source: {
    seedKey: `depot-${depotId}`,
    mapName: "market-test",
    mapVersion: "test",
    typeId: 3497,
    attributes: { depotId },
    position: depotPosition,
    stackIndex: 1,
    contents: [],
  },
});

const storedGems = (count: number): Item => ({
  id: "22222222-2222-4222-8222-222222222222",
  typeId: GEM_TYPE,
  count,
  attributes: {},
  version: 3,
  location: { kind: "depot", characterId: "market-player", depotId: 7, slot: 0 },
});

const makeMarketStore = (): MarketStore => ({
  openData: vi.fn(async () => ({
    balance: 5_000,
    activeOfferCount: 1,
    offerTypeIds: [GEM_TYPE],
  })),
  averagePrices: vi.fn(async () => new Map([[GEM_TYPE, 450]])),
  offersForType: vi.fn(async () => []),
  offerById: vi.fn(async () => null),
  ownOffers: vi.fn(async () => []),
  ownHistory: vi.fn(async () => []),
  createSellOffer: vi.fn(async () => ({
    status: "committed" as const,
    offerId: randomUUID(),
    expiresAt: new Date(),
    balance: 4_000,
    depotUpserts: [],
    removedItemIds: [storedGems(1).id],
    sourceDepotIds: [7],
  })),
  createBuyOffer: vi.fn(async () => ({
    status: "committed" as const,
    offerId: randomUUID(),
    expiresAt: new Date(),
    balance: 3_000,
    depotUpserts: [],
    removedItemIds: [],
    sourceDepotIds: [],
  })),
  acceptSellOffer: vi.fn(),
  acceptBuyOffer: vi.fn(),
  cancelOffer: vi.fn(),
  resolveExpired: vi.fn(async () => []),
});

const makeHarness = (
  options: { stored?: Item[]; accountTier?: AccountTier } = {},
) => {
  const base = gridMapData({
    name: "market-test",
    width: 40,
    height: 40,
    blocked: [],
    floors: [7],
    towns: [{ id: 7, name: "Thais" }],
  });
  const map: MapData = {
    ...base,
    getItems(position) {
      return position.x === depotPosition.x &&
        position.y === depotPosition.y &&
        position.z === depotPosition.z
        ? [mapDepot(7)]
        : [];
    },
  };
  const world = new World(map, 25);
  const accountTier = options.accountTier ?? "premium";
  const premiumUntil =
    accountTier === "premium" ? new Date("2100-01-01T00:00:00.000Z") : null;
  const player = new Player(
    makeCharacter("market-player", "Market Player"),
    { x: 10, y: 10, z: 7 },
    0,
    premiumUntil,
  );
  world.addPlayer(player);
  const messages: ServerMessage[] = [];
  const socket = {
    on: vi.fn(),
    readyState: 1,
    OPEN: 1,
    send: (data: string) => messages.push(JSON.parse(data) as ServerMessage),
    terminate: vi.fn(),
  } as unknown as WebSocket;
  const session = new Session("market-session", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = player.id;
  session.account = {
    id: "market-account",
    supabaseUserId: "market-user",
    email: null,
    bannedUntil: null,
    premiumUntil,
    language: "en",
    uiSettings: {},
  };
  const items = new ItemIntentHandler(
    new MemoryItemStore(catalog),
    catalog,
    world,
    new Visibility(world, new SessionRegistry()),
  );
  items.attach({ characterId: player.id, capacityMax: 400, items: [] });
  const depotStore = {
    loadForCharacter: vi.fn(),
    persist: vi.fn(async () => undefined),
    sendMail: vi.fn(),
    deliverReward: vi.fn(),
    returnExpired: vi.fn(async () => []),
  } as unknown as DepotStore;
  const depot = new DepotService(world, items, catalog, depotStore);
  depot.attach({
    characterId: player.id,
    items: options.stored ?? [],
    stash: new Map(),
    depotRevisions: new Map(),
    inboxRevision: 1,
    stashRevision: 1,
  });
  const store = makeMarketStore();
  const market = new MarketService(items, catalog, depot, store);
  return { world, player, session, messages, depot, market, store };
};

describe("MarketService", () => {
  it("rejects free-account offer creation before escrow changes", () => {
    const harness = makeHarness({ accountTier: "free" });

    harness.market.handle(
      harness.session,
      {
        type: "market-create-offer",
        requestId: randomUUID(),
        side: "buy",
        itemTypeId: GEM_TYPE,
        amount: 1,
        unitPrice: 100,
      },
      0,
    );

    expect(harness.store.createBuyOffer).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "market-action-failed",
      reason: "premium-required",
    });
  });

  it("commits a buy offer anywhere, with no depot session open", async () => {
    const harness = makeHarness();
    harness.world.relocateCreature(harness.player, { x: 30, y: 30, z: 7 });

    harness.market.handle(
      harness.session,
      {
        type: "market-create-offer",
        requestId: randomUUID(),
        side: "buy",
        itemTypeId: GEM_TYPE,
        amount: 1,
        unitPrice: 100,
      },
      0,
    );
    await nextTurn();
    harness.market.applyResolvedOutcomes(0);

    expect(harness.store.createBuyOffer).toHaveBeenCalledTimes(1);
    expect(harness.messages).toContainEqual(
      expect.objectContaining({ type: "market-transacted", kind: "created" }),
    );
  });

  it("opens the market with owned depot stock merged into the item list", async () => {
    const harness = makeHarness({ stored: [storedGems(40)] });

    harness.market.handle(
      harness.session,
      { type: "market-open", page: 1 },
      0,
    );
    await nextTurn();
    harness.market.applyResolvedOutcomes(0);

    const opened = harness.messages.find(
      (message) => message.type === "market-opened",
    );
    expect(opened).toBeDefined();
    if (!opened || opened.type !== "market-opened") return;
    expect(opened.balance).toBe(5_000);
    expect(opened.items).toEqual([
      expect.objectContaining({
        itemTypeId: GEM_TYPE,
        category: "valuables",
        ownedCount: 40,
        averagePrice: 450,
      }),
    ]);
  });

  it("enforces the one-second mutation cooldown per session", () => {
    const harness = makeHarness({ stored: [storedGems(40)] });
    const intent = () => ({
      type: "market-create-offer" as const,
      requestId: randomUUID(),
      side: "buy" as const,
      itemTypeId: GEM_TYPE,
      amount: 1,
      unitPrice: 100,
    });

    harness.market.handle(harness.session, intent(), 1_000);
    harness.session.itemOperationPending = false; // simulate resolved commit
    harness.market.handle(harness.session, intent(), 1_500);
    harness.market.handle(harness.session, intent(), 2_100);

    expect(harness.store.createBuyOffer).toHaveBeenCalledTimes(2);
    expect(harness.messages).toContainEqual({
      type: "market-action-failed",
      reason: "cooldown",
    });
  });

  it("reports busy while item persists are pending instead of committing", () => {
    const harness = makeHarness();
    harness.session.itemPersistsPending = 1;

    harness.market.handle(
      harness.session,
      {
        type: "market-create-offer",
          requestId: randomUUID(),
        side: "buy",
        itemTypeId: GEM_TYPE,
        amount: 1,
        unitPrice: 100,
      },
      0,
    );

    expect(harness.store.createBuyOffer).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "market-action-failed",
      reason: "busy",
    });
  });

  it("rejects unmarketable types and oversized amounts before any commit", () => {
    const harness = makeHarness({ stored: [storedGems(40)] });

    harness.market.handle(
      harness.session,
      {
        type: "market-create-offer",
          requestId: randomUUID(),
        side: "sell",
        itemTypeId: JUNK_TYPE,
        amount: 1,
        unitPrice: 100,
      },
      0,
    );
    harness.market.handle(
      harness.session,
      {
        type: "market-create-offer",
          requestId: randomUUID(),
        side: "sell",
        itemTypeId: GEM_TYPE,
        amount: 41,
        unitPrice: 100,
      },
      2_000,
    );

    expect(harness.store.createSellOffer).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "market-action-failed",
      reason: "not-marketable",
    });
    expect(harness.messages).toContainEqual({
      type: "market-action-failed",
      reason: "insufficient-items",
    });
  });

  it("rejects totals beyond the price cap without touching the store", () => {
    const harness = makeHarness({ stored: [storedGems(40)] });

    harness.market.handle(
      harness.session,
      {
        type: "market-create-offer",
          requestId: randomUUID(),
        side: "buy",
        itemTypeId: GEM_TYPE,
        amount: 64_000,
        unitPrice: 1_000_000_000_000,
      },
      0,
    );

    expect(harness.store.createBuyOffer).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "market-action-failed",
      reason: "price-limit",
    });
  });

  it("commits a sell offer and applies the depot cache removal", async () => {
    const harness = makeHarness({ stored: [storedGems(40)] });

    harness.market.handle(
      harness.session,
      {
        type: "market-create-offer",
          requestId: randomUUID(),
        side: "sell",
        itemTypeId: GEM_TYPE,
        amount: 1,
        unitPrice: 100,
      },
      0,
    );
    expect(harness.session.itemOperationPending).toBe(true);
    await nextTurn();
    harness.market.applyResolvedOutcomes(0);

    expect(harness.store.createSellOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: harness.player.id,
        sources: [
          expect.objectContaining({ itemId: storedGems(1).id, take: 1 }),
        ],
      }),
    );
    expect(harness.session.itemOperationPending).toBe(false);
    expect(harness.messages).toContainEqual(
      expect.objectContaining({ type: "market-transacted", kind: "created" }),
    );
    expect(harness.depot.cacheFor(harness.player.id)?.items).toHaveLength(0);
  });
});
