import type { ServerMessage } from "@tibia/protocol";
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
import { DepotService } from "./DepotService";
import type { DepotStore } from "./DepotStore";

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const depotPosition = { x: 11, y: 10, z: 7 } as const;
const SWORD_TYPE = 100;
const COIN_TYPE = 101;

const makeItemType = (overrides: Partial<ItemType> & { id: number }): ItemType => ({
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
    stowable: true,
    weight: 1,
  }),
]);

const mapDepot = (depotId: number): MapItem => ({
  instanceId: `depot-${depotId}`,
  itemId: 3497,
  stackIndex: 1,
  mutable: false,
  source: {
    seedKey: `depot-${depotId}`,
    mapName: "depot-test",
    mapVersion: "test",
    typeId: 3497,
    attributes: { depotId },
    position: depotPosition,
    stackIndex: 1,
    contents: [],
  },
});

interface HarnessOptions {
  readonly carried?: Item[];
  readonly stored?: Item[];
  readonly persist?: (plan: unknown) => Promise<void>;
}

const makeHarness = (options: HarnessOptions = {}) => {
  let depotId = 7;
  const base = gridMapData({
    name: "depot-test",
    width: 40,
    height: 40,
    blocked: [],
    floors: [7],
    towns: [
      { id: 7, name: "Thais" },
      { id: 8, name: "Carlin" },
    ],
  });
  const map: MapData = {
    ...base,
    getItems(position) {
      return position.x === depotPosition.x &&
        position.y === depotPosition.y &&
        position.z === depotPosition.z
        ? [mapDepot(depotId)]
        : [];
    },
  };
  const world = new World(map, 25);
  const player = new Player(makeCharacter("depot-player", "Depot Player"), {
    x: 10,
    y: 10,
    z: 7,
  });
  world.addPlayer(player);
  const messages: ServerMessage[] = [];
  const terminate = vi.fn();
  const socket = {
    on: vi.fn(),
    readyState: 1,
    OPEN: 1,
    send: (data: string) => messages.push(JSON.parse(data) as ServerMessage),
    terminate,
  } as unknown as WebSocket;
  const session = new Session("depot-session", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = player.id;
  const items = new ItemIntentHandler(
    new MemoryItemStore(catalog),
    catalog,
    world,
    new Visibility(world, new SessionRegistry()),
  );
  items.attach({
    characterId: player.id,
    capacityMax: 400,
    items: options.carried ?? [],
  });
  const persist = vi.fn(options.persist ?? (async () => undefined));
  const store = {
    loadForCharacter: vi.fn(),
    persist,
    sendMail: vi.fn(),
    deliverReward: vi.fn(),
    returnExpired: vi.fn(async () => []),
  } as unknown as DepotStore;
  const depot = new DepotService(world, items, catalog, store);
  depot.attach({
    characterId: player.id,
    items: options.stored ?? [],
    stash: new Map(),
    depotRevisions: new Map(),
    inboxRevision: 1,
    stashRevision: 1,
  });
  return {
    world,
    player,
    session,
    messages,
    depot,
    items,
    persist,
    terminate,
    carriedItems: () =>
      items.inventorySnapshot(player.id)?.items ?? ([] as ReadonlyArray<Item>),
    replaceDepot(nextDepotId: number) {
      depotId = nextDepotId;
    },
  };
};

const openDepot = (harness: ReturnType<typeof makeHarness>): string => {
  expect(harness.depot.handleMapUse(harness.session, depotPosition)).toBe(true);
  const opened = harness.messages.find(
    (message) => message.type === "depot-state",
  );
  if (!opened || opened.type !== "depot-state") {
    throw new Error("depot did not open");
  }
  return opened.sessionId;
};

const carriedSword = (): Item => ({
  id: "11111111-1111-4111-8111-111111111111",
  typeId: SWORD_TYPE,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "inventory", characterId: "depot-player", slot: 0 },
});

const storedSword = (): Item => ({
  id: "22222222-2222-4222-8222-222222222222",
  typeId: SWORD_TYPE,
  count: 1,
  attributes: {},
  version: 3,
  location: { kind: "depot", characterId: "depot-player", depotId: 7, slot: 0 },
});

describe("DepotService", () => {
  it("opens an adjacent map depot from memory in the same tick", () => {
    const harness = makeHarness();

    harness.depot.handleMapUse(harness.session, depotPosition);

    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "depot-state",
        depotId: 7,
        townName: "Thais",
        depotCount: 0,
      }),
    );
  });

  it("rejects access after the player leaves the reachable depot", () => {
    const harness = makeHarness();
    const sessionId = openDepot(harness);
    harness.world.relocateCreature(harness.player, { x: 30, y: 30, z: 7 });

    harness.depot.handle(harness.session, {
      type: "depot-browse",
      sessionId,
      location: "depot",
      page: 1,
      query: "",
    });

    expect(harness.messages).toContainEqual({
      type: "depot-action-failed",
      reason: "out-of-range",
    });
  });

  it("rejects an intent when the map object no longer identifies that depot", () => {
    const harness = makeHarness({ carried: [carriedSword()] });
    const sessionId = openDepot(harness);
    harness.replaceDepot(8);

    harness.depot.handle(harness.session, {
      type: "depot-deposit",
      sessionId,
      depotRevision: 1,
      itemId: carriedSword().id,
      itemRevision: 1,
    });

    expect(harness.persist).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "depot-action-failed",
      reason: "out-of-range",
    });
  });

  it("deposits and withdraws the same item back-to-back within one tick", async () => {
    const sword = carriedSword();
    const harness = makeHarness({ carried: [sword] });
    const sessionId = openDepot(harness);

    harness.depot.handle(harness.session, {
      type: "depot-deposit",
      sessionId,
      depotRevision: 1,
      itemId: sword.id,
      itemRevision: 1,
    });

    const afterDeposit = harness.messages
      .filter((message) => message.type === "depot-state")
      .at(-1);
    if (afterDeposit?.type !== "depot-state") throw new Error("no state");
    expect(afterDeposit.depotCount).toBe(1);
    expect(afterDeposit.depotRevision).toBe(2);
    const entry = afterDeposit.entries[0];
    if (!entry || entry.location !== "depot") throw new Error("no entry");
    expect(entry.itemId).toBe(sword.id);

    harness.depot.handle(harness.session, {
      type: "depot-withdraw",
      sessionId,
      source: "depot",
      sourceRevision: afterDeposit.depotRevision,
      itemId: entry.itemId,
      itemRevision: entry.revision,
    });

    const afterWithdraw = harness.messages
      .filter((message) => message.type === "depot-state")
      .at(-1);
    if (afterWithdraw?.type !== "depot-state") throw new Error("no state");
    expect(afterWithdraw.depotCount).toBe(0);
    expect(
      harness.carriedItems().find((item) => item.id === sword.id),
    ).toBeDefined();
    await nextTurn();
    expect(harness.persist).toHaveBeenCalledTimes(2);
  });

  it("refreshes the authoritative depot page after a stale intent", () => {
    const harness = makeHarness({ carried: [carriedSword()] });
    const sessionId = openDepot(harness);

    harness.depot.handle(harness.session, {
      type: "depot-deposit",
      sessionId,
      depotRevision: 99,
      itemId: carriedSword().id,
      itemRevision: 1,
    });

    expect(harness.messages).toContainEqual({
      type: "depot-action-failed",
      reason: "stale",
    });
    const refresh = harness.messages
      .filter((message) => message.type === "depot-state")
      .at(-1);
    expect(refresh).toBeDefined();
    expect(harness.persist).not.toHaveBeenCalled();
  });

  it("lets exactly one of two racing withdrawals for the same item succeed", async () => {
    const stored = storedSword();
    const harness = makeHarness({ stored: [stored] });
    const sessionId = openDepot(harness);
    const withdraw = {
      type: "depot-withdraw" as const,
      sessionId,
      source: "depot" as const,
      sourceRevision: 1,
      itemId: stored.id,
      itemRevision: stored.version,
    };

    harness.depot.handle(harness.session, withdraw);
    harness.depot.handle(harness.session, withdraw);

    expect(
      harness.messages.filter(
        (message) => message.type === "inventory-updated",
      ),
    ).toHaveLength(1);
    await nextTurn();
    expect(harness.persist).toHaveBeenCalledTimes(1);
    expect(harness.messages).toContainEqual({
      type: "depot-action-failed",
      reason: "stale",
    });
    expect(
      harness.carriedItems().filter((item) => item.id === stored.id),
    ).toHaveLength(1);
  });

  it("disconnects the session when a persist write fails", async () => {
    const harness = makeHarness({
      carried: [carriedSword()],
      persist: async () => {
        throw new Error("db down");
      },
    });
    const sessionId = openDepot(harness);

    harness.depot.handle(harness.session, {
      type: "depot-deposit",
      sessionId,
      depotRevision: 1,
      itemId: carriedSword().id,
      itemRevision: 1,
    });
    await nextTurn();
    harness.items.applyResolvedOutcomes(Date.now());

    expect(harness.terminate).toHaveBeenCalled();
  });

  it("rejects depot mutations while a carried-item DB op is in flight", () => {
    const harness = makeHarness({ carried: [carriedSword()] });
    const sessionId = openDepot(harness);
    harness.session.itemOperationPending = true;

    harness.depot.handle(harness.session, {
      type: "depot-deposit",
      sessionId,
      depotRevision: 1,
      itemId: carriedSword().id,
      itemRevision: 1,
    });

    expect(harness.persist).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "depot-action-failed",
      reason: "busy",
    });
  });

  it("keeps depot writes ordered and pipelined across rapid mutations", async () => {
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const harness = makeHarness({
      carried: [carriedSword()],
      persist: (plan) =>
        new Promise<void>((resolve) => {
          const rowOps = (plan as { rowOps: ReadonlyArray<{ kind: string }> })
            .rowOps;
          order.push(rowOps[0]?.kind ?? "none");
          if (!releaseFirst) {
            releaseFirst = resolve;
            return;
          }
          resolve();
        }),
    });
    const sessionId = openDepot(harness);
    const sword = carriedSword();

    harness.depot.handle(harness.session, {
      type: "depot-deposit",
      sessionId,
      depotRevision: 1,
      itemId: sword.id,
      itemRevision: 1,
    });
    harness.depot.handle(harness.session, {
      type: "depot-withdraw",
      sessionId,
      source: "depot",
      sourceRevision: 2,
      itemId: sword.id,
      itemRevision: 2,
    });
    await nextTurn();
    // Second write must wait for the first even though memory already moved on.
    expect(order).toHaveLength(1);
    releaseFirst?.();
    await nextTurn();
    await nextTurn();
    expect(order).toHaveLength(2);
    expect(harness.session.itemPersistsPending).toBeGreaterThan(0);
    harness.items.applyResolvedOutcomes(Date.now());
    expect(harness.session.itemPersistsPending).toBe(0);
  });
});
