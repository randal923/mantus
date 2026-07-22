import type { ServerMessage, TradeStateMessage } from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { gridMapData } from "../gridMapData";
import type { Item } from "../item/Item";
import { ItemCatalog } from "../item/ItemCatalog";
import { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { ItemType } from "../item/ItemType";
import { MemoryItemStore } from "../item/MemoryItemStore";
import { Player } from "../Player";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { MemoryTradeStore } from "./MemoryTradeStore";
import { TradeService } from "./TradeService";

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const SWORD_TYPE = 3264;
const COIN_TYPE = 3031;
const BACKPACK_TYPE = 2854;

const SWORD_ID = "11111111-1111-4111-8111-111111111111";
const COINS_ID = "22222222-2222-4222-8222-222222222222";
const BACKPACK_ID = "33333333-3333-4333-8333-333333333333";
const equippedBackpackId = (owner: string) => `equipped-backpack:${owner}`;

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
  makeItemType({ id: SWORD_TYPE, name: "sword" }),
  makeItemType({
    id: COIN_TYPE,
    name: "gold coin",
    stackable: true,
    maxCount: 100,
    weight: 1,
  }),
  makeItemType({
    id: BACKPACK_TYPE,
    name: "backpack",
    weight: 180,
    containerCapacity: 20,
    equipmentSlot: "backpack",
  }),
]);

const sword = (owner: string): Item => ({
  id: SWORD_ID,
  typeId: SWORD_TYPE,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: equippedBackpackId(owner), slot: 0 },
});

const coins = (owner: string): Item => ({
  id: COINS_ID,
  typeId: COIN_TYPE,
  count: 50,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: equippedBackpackId(owner), slot: 0 },
});

const makeHarness = (options?: {
  itemsA?: Item[];
  itemsB?: Item[];
  capacityB?: number;
}) => {
  const map = gridMapData({
    name: "trade-test",
    width: 40,
    height: 40,
    blocked: [],
    floors: [7],
    towns: [{ id: 7, name: "Thais" }],
  });
  const world = new World(map, 25);
  const registry = new SessionRegistry();
  const itemStore = new MemoryItemStore(catalog);
  const items = new ItemIntentHandler(
    itemStore,
    catalog,
    world,
    new Visibility(world, registry),
  );
  const tradeStore = new MemoryTradeStore(itemStore, catalog);
  const trade = new TradeService(
    world,
    registry,
    items,
    itemStore,
    catalog,
    tradeStore,
  );

  const join = (
    characterId: string,
    name: string,
    position: { x: number; y: number; z: number },
    carried: Item[],
    capacityMax = 400,
  ) => {
    const player = new Player(makeCharacter(characterId, name), position);
    world.addPlayer(player);
    const messages: ServerMessage[] = [];
    const socket = {
      on: vi.fn(),
      readyState: 1,
      OPEN: 1,
      send: (data: string) => messages.push(JSON.parse(data) as ServerMessage),
      terminate: vi.fn(),
    } as unknown as WebSocket;
    const session = new Session(`session-${characterId}`, "127.0.0.1", socket, {
      maxPendingIntents: 16,
      maxProtocolViolations: 5,
      initialViewRange: { x: 9, y: 7 },
    });
    session.playerId = characterId;
    registry.add(session);
    registry.bindPlayer(session);
    const backpack: Item = {
      id: equippedBackpackId(characterId),
      typeId: BACKPACK_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "equipment",
        characterId,
        slot: "backpack",
      },
    };
    const inventory = [backpack, ...carried];
    for (const item of inventory) itemStore.seed(item);
    items.attach({ characterId, capacityMax, items: inventory });
    return { player, session, messages };
  };

  const a = join("player-a", "Trader One", { x: 10, y: 10, z: 7 }, [
    ...(options?.itemsA ?? [sword("player-a")]),
  ]);
  const b = join(
    "player-b",
    "Trader Two",
    { x: 11, y: 10, z: 7 },
    [...(options?.itemsB ?? [coins("player-b")])],
    options?.capacityB,
  );
  return { world, registry, items, itemStore, trade, a, b };
};

const settle = async (harness: ReturnType<typeof makeHarness>, now: number) => {
  for (let round = 0; round < 3; round++) {
    await nextTurn();
    harness.trade.applyResolvedOutcomes(now);
    harness.items.applyResolvedOutcomes(now);
  }
};

const itemById = (harness: ReturnType<typeof makeHarness>, id: string) =>
  harness.itemStore.allItems().find((item) => item.id === id);

const countOfType = (harness: ReturnType<typeof makeHarness>, typeId: number) =>
  harness.itemStore
    .allItems()
    .filter((item) => item.typeId === typeId)
    .reduce((total, item) => total + item.count, 0);

describe("TradeService", () => {
  it("runs invite, counter-offer, and double accept to a committed swap", async () => {
    const harness = makeHarness();
    const { trade, a, b } = harness;

    trade.handle(
      a.session,
      {
        type: "trade-request",
        targetPlayerId: "player-b",
        itemId: SWORD_ID,
        revision: 1,
      },
      0,
    );
    expect(b.messages).toContainEqual(
      expect.objectContaining({ type: "trade-state", partnerName: "Trader One" }),
    );

    trade.handle(
      b.session,
      {
        type: "trade-request",
        targetPlayerId: "player-a",
        itemId: COINS_ID,
        revision: 1,
      },
      0,
    );
    const states = a.messages.filter(
      (message): message is TradeStateMessage => message.type === "trade-state",
    );
    const state = states[states.length - 1];
    expect(state?.partnerOffer?.[0]?.item.id).toBe(COINS_ID);

    trade.handle(a.session, { type: "trade-accept" }, 2_000);
    trade.handle(b.session, { type: "trade-accept" }, 2_000);
    await settle(harness, 2_000);

    expect(a.messages).toContainEqual({
      type: "trade-closed",
      reason: "completed",
    });
    expect(b.messages).toContainEqual({
      type: "trade-closed",
      reason: "completed",
    });
    expect(itemById(harness, SWORD_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-b"),
    });
    expect(itemById(harness, COINS_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-a"),
    });
    expect(countOfType(harness, SWORD_TYPE)).toBe(1);
    expect(countOfType(harness, COIN_TYPE)).toBe(50);
  });

  it("blocks every move of a reserved item while the trade is open", async () => {
    const harness = makeHarness();
    const { trade, items, a } = harness;

    trade.handle(
      a.session,
      {
        type: "trade-request",
        targetPlayerId: "player-b",
        itemId: SWORD_ID,
        revision: 1,
      },
      0,
    );
    await settle(harness, 0);
    expect(itemById(harness, SWORD_ID)?.location.kind).toBe(
      "trade-reservation",
    );

    a.messages.length = 0;
    items.handle(
      a.session,
      {
        type: "drop-item",
        itemId: SWORD_ID,
        revision: 2,
        position: { x: 10, y: 11, z: 7 },
      },
      0,
    );
    expect(a.messages).toContainEqual({
      type: "error",
      code: "item-action-failed",
    });
    await settle(harness, 0);
    expect(itemById(harness, SWORD_ID)?.location.kind).toBe(
      "trade-reservation",
    );
    expect(countOfType(harness, SWORD_TYPE)).toBe(1);
  });

  it("restores both offers when a trade is cancelled", async () => {
    const harness = makeHarness();
    const { trade, a, b } = harness;

    trade.handle(
      a.session,
      {
        type: "trade-request",
        targetPlayerId: "player-b",
        itemId: SWORD_ID,
        revision: 1,
      },
      0,
    );
    trade.handle(
      b.session,
      {
        type: "trade-request",
        targetPlayerId: "player-a",
        itemId: COINS_ID,
        revision: 1,
      },
      0,
    );
    trade.handle(b.session, { type: "trade-cancel" }, 100);
    await settle(harness, 100);

    expect(a.messages).toContainEqual({
      type: "trade-closed",
      reason: "cancelled",
    });
    expect(itemById(harness, SWORD_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-a"),
    });
    expect(itemById(harness, COINS_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-b"),
    });
    expect(countOfType(harness, SWORD_TYPE)).toBe(1);
    expect(countOfType(harness, COIN_TYPE)).toBe(50);
  });

  it("ignores a cancel that races the commit and still conserves both legs", async () => {
    const harness = makeHarness();
    const { trade, a, b } = harness;

    trade.handle(
      a.session,
      {
        type: "trade-request",
        targetPlayerId: "player-b",
        itemId: SWORD_ID,
        revision: 1,
      },
      0,
    );
    trade.handle(
      b.session,
      {
        type: "trade-request",
        targetPlayerId: "player-a",
        itemId: COINS_ID,
        revision: 1,
      },
      0,
    );
    trade.handle(a.session, { type: "trade-accept" }, 2_000);
    trade.handle(b.session, { type: "trade-accept" }, 2_000);
    // Same-tick cancel after both accepts: the swap is already in flight.
    trade.handle(b.session, { type: "trade-cancel" }, 2_000);
    await settle(harness, 2_000);

    expect(itemById(harness, SWORD_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-b"),
    });
    expect(itemById(harness, COINS_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-a"),
    });
    expect(countOfType(harness, SWORD_TYPE)).toBe(1);
    expect(countOfType(harness, COIN_TYPE)).toBe(50);
  });

  it("cancels on disconnect and restores the online partner's offer", async () => {
    const harness = makeHarness();
    const { trade, a, b } = harness;

    trade.handle(
      a.session,
      {
        type: "trade-request",
        targetPlayerId: "player-b",
        itemId: SWORD_ID,
        revision: 1,
      },
      0,
    );
    trade.handle(
      b.session,
      {
        type: "trade-request",
        targetPlayerId: "player-a",
        itemId: COINS_ID,
        revision: 1,
      },
      0,
    );
    trade.detachCharacter("player-b", 500);
    await settle(harness, 500);

    expect(a.messages).toContainEqual({
      type: "trade-closed",
      reason: "disconnected",
    });
    expect(itemById(harness, SWORD_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-a"),
    });
    expect(itemById(harness, COINS_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-b"),
    });
  });

  it("cancels when the partners walk out of trade range", async () => {
    const harness = makeHarness();
    const { trade, world, a } = harness;

    trade.handle(
      a.session,
      {
        type: "trade-request",
        targetPlayerId: "player-b",
        itemId: SWORD_ID,
        revision: 1,
      },
      0,
    );
    world.relocateCreature(a.player, { x: 20, y: 10, z: 7 });
    trade.tick(100);
    await settle(harness, 100);

    expect(a.messages).toContainEqual({
      type: "trade-closed",
      reason: "moved-away",
    });
    expect(itemById(harness, SWORD_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-a"),
    });
  });

  it("cancels an idle trade on timeout", async () => {
    const harness = makeHarness();
    const { trade, a } = harness;

    trade.handle(
      a.session,
      {
        type: "trade-request",
        targetPlayerId: "player-b",
        itemId: SWORD_ID,
        revision: 1,
      },
      0,
    );
    trade.tick(121_000);
    await settle(harness, 121_000);

    expect(a.messages).toContainEqual({
      type: "trade-closed",
      reason: "timeout",
    });
    expect(itemById(harness, SWORD_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-a"),
    });
  });

  it("aborts the whole swap and restores both legs when a receiver lacks capacity", async () => {
    const harness = makeHarness({ capacityB: 0 });
    const { trade, a, b } = harness;

    trade.handle(
      a.session,
      {
        type: "trade-request",
        targetPlayerId: "player-b",
        itemId: SWORD_ID,
        revision: 1,
      },
      0,
    );
    trade.handle(
      b.session,
      {
        type: "trade-request",
        targetPlayerId: "player-a",
        itemId: COINS_ID,
        revision: 1,
      },
      0,
    );
    trade.handle(a.session, { type: "trade-accept" }, 2_000);
    trade.handle(b.session, { type: "trade-accept" }, 2_000);
    await settle(harness, 2_000);

    expect(a.messages).toContainEqual({
      type: "trade-closed",
      reason: "no-capacity",
    });
    expect(itemById(harness, SWORD_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-a"),
    });
    expect(itemById(harness, COINS_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-b"),
    });
    expect(countOfType(harness, SWORD_TYPE)).toBe(1);
    expect(countOfType(harness, COIN_TYPE)).toBe(50);
  });

  it("carries a container offer with nested contents and delivers the subtree", async () => {
    const backpack: Item = {
      id: BACKPACK_ID,
      typeId: BACKPACK_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "equipment", characterId: "player-a", slot: "backpack" },
    };
    const nestedSword: Item = {
      ...sword("player-a"),
      location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
    };
    const harness = makeHarness({ itemsA: [backpack, nestedSword] });
    const { trade, a, b } = harness;

    trade.handle(
      a.session,
      {
        type: "trade-request",
        targetPlayerId: "player-b",
        itemId: BACKPACK_ID,
        revision: 1,
      },
      0,
    );
    const states = b.messages.filter(
      (message): message is TradeStateMessage => message.type === "trade-state",
    );
    const state = states[states.length - 1];
    expect(state?.partnerOffer?.map((entry) => entry.depth)).toEqual([0, 1]);

    trade.handle(
      b.session,
      {
        type: "trade-request",
        targetPlayerId: "player-a",
        itemId: COINS_ID,
        revision: 1,
      },
      0,
    );
    trade.handle(a.session, { type: "trade-accept" }, 2_000);
    trade.handle(b.session, { type: "trade-accept" }, 2_000);
    await settle(harness, 2_000);

    expect(itemById(harness, BACKPACK_ID)?.location).toMatchObject({
      kind: "container",
      containerId: equippedBackpackId("player-b"),
    });
    expect(itemById(harness, SWORD_ID)?.location).toMatchObject({
      kind: "container",
      containerId: BACKPACK_ID,
    });
  });

  it("rejects a second trade while one is open", () => {
    const third: Item = {
      ...sword("player-a"),
      id: "44444444-4444-4444-8444-444444444444",
      location: {
        kind: "container",
        containerId: equippedBackpackId("player-a"),
        slot: 1,
      },
    };
    const harness = makeHarness({ itemsA: [sword("player-a"), third] });
    const { trade, world, a } = harness;
    const playerC = new Player(makeCharacter("player-c", "Trader Three"), {
      x: 10,
      y: 11,
      z: 7,
    });
    world.addPlayer(playerC);

    trade.handle(
      a.session,
      {
        type: "trade-request",
        targetPlayerId: "player-b",
        itemId: SWORD_ID,
        revision: 1,
      },
      0,
    );
    a.messages.length = 0;
    trade.handle(
      a.session,
      {
        type: "trade-request",
        targetPlayerId: "player-c",
        itemId: third.id,
        revision: 1,
      },
      2_000,
    );
    expect(a.messages).toContainEqual({
      type: "trade-action-failed",
      reason: "already-trading",
    });
  });
});
