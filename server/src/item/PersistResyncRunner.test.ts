import type { ServerMessage } from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { DepotService } from "../depot/DepotService";
import type { DepotStore } from "../depot/DepotStore";
import type { LoadedDepot } from "../depot/LoadedDepot";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import type { Item } from "./Item";
import { ItemCatalog } from "./ItemCatalog";
import type { ItemType } from "./ItemType";
import { ItemIntentHandler } from "./ItemIntentHandler";
import { MemoryItemStore } from "./MemoryItemStore";
import { PersistResyncRunner } from "./PersistResyncRunner";

const CHARACTER_ID = "resync-character";
const BACKPACK_ID = "resync-backpack";
const SWORD_ID = "resync-sword";
const STORED_ID = "resync-stored";
const BACKPACK_TYPE = 2854;
const SWORD_TYPE = 100;

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
  makeItemType({ id: BACKPACK_TYPE, name: "backpack", containerCapacity: 20 }),
  makeItemType({ id: SWORD_TYPE, name: "sword" }),
]);

const committedCarried = (): Item[] => [
  {
    id: BACKPACK_ID,
    typeId: BACKPACK_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "equipment", characterId: CHARACTER_ID, slot: "backpack" },
  },
  {
    id: SWORD_ID,
    typeId: SWORD_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId: BACKPACK_ID, slot: 3 },
  },
];

const committedDepot = (): LoadedDepot => ({
  characterId: CHARACTER_ID,
  items: [
    {
      id: STORED_ID,
      typeId: SWORD_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "depot", characterId: CHARACTER_ID, depotId: 1, slot: 0 },
    },
  ],
  stash: new Map(),
  depotRevisions: new Map([[1, 4]]),
  inboxRevision: 1,
  stashRevision: 1,
});

function makeHarness(options: { loadDepot?: () => Promise<LoadedDepot> } = {}) {
  const world = new World(
    gridMapData({ name: "test", width: 3, height: 3, blocked: [] }),
    25,
  );
  const player = new Player(makeCharacter(CHARACTER_ID, "Resync Tester"), {
    x: 1,
    y: 1,
    z: 7,
  });
  world.addPlayer(player);
  const messages: ServerMessage[] = [];
  const terminate = vi.fn();
  const socket = {
    OPEN: 1,
    readyState: 1,
    on: vi.fn(),
    terminate,
    send: (data: string) => messages.push(JSON.parse(data) as ServerMessage),
  } as unknown as WebSocket;
  const session = new Session("resync-session", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = player.id;
  const registry = new SessionRegistry();
  registry.add(session);
  registry.bindPlayer(session);
  const itemStore = new MemoryItemStore(catalog);
  for (const item of committedCarried()) itemStore.seed(item);
  itemStore.persist = async () => {
    throw new Error("db down");
  };
  const items = new ItemIntentHandler(
    itemStore,
    catalog,
    world,
    new Visibility(world, registry),
  );
  const loadForCharacter = vi.fn(
    options.loadDepot ?? (async () => committedDepot()),
  );
  const depotStore = {
    loadForCharacter,
    persist: vi.fn(),
    sendMail: vi.fn(),
    deliverReward: vi.fn(),
    returnExpired: vi.fn(async () => []),
  } as unknown as DepotStore;
  const depot = new DepotService(world, items, catalog, depotStore);
  const resync = new PersistResyncRunner(items, depot, registry);
  items.setPersistResync((target, characterId) =>
    resync.start(target, characterId),
  );
  return {
    depot,
    items,
    loadForCharacter,
    messages,
    player,
    registry,
    resync,
    session,
    terminate,
    world,
  };
}

const attachCaches = (harness: ReturnType<typeof makeHarness>): void => {
  harness.items.attach({
    characterId: CHARACTER_ID,
    capacityMax: 400,
    items: committedCarried(),
  });
  harness.depot.attach(committedDepot());
};

/** Moves the sword between container slots; the persist behind it fails. */
const failingMove = (harness: ReturnType<typeof makeHarness>): void => {
  harness.items.handle(harness.session, {
    type: "move-item",
    itemId: SWORD_ID,
    revision: 1,
    destinationContainerId: BACKPACK_ID,
    destinationRevision: 1,
    destinationSlot: 0,
  });
};

const settle = async (harness: ReturnType<typeof makeHarness>): Promise<void> => {
  await nextTurn();
  harness.items.applyResolvedOutcomes(Date.now());
  await harness.resync.stop();
  harness.resync.applyResolvedOutcomes();
};

describe("PersistResyncRunner", () => {
  it("rebuilds carried and depot caches from the DB instead of disconnecting", async () => {
    const harness = makeHarness();
    attachCaches(harness);
    // Memory diverges: the move is applied in memory, its write then fails.
    failingMove(harness);
    expect(
      harness.items
        .inventorySnapshot(CHARACTER_ID)
        ?.items.find((item) => item.id === SWORD_ID)?.location,
    ).toMatchObject({ slot: 0 });

    await settle(harness);

    expect(harness.terminate).not.toHaveBeenCalled();
    expect(harness.items.isPersistPoisoned(CHARACTER_ID)).toBe(false);
    // Committed DB state wins: the unpersisted move is gone, not duplicated.
    const carried = harness.items.inventorySnapshot(CHARACTER_ID)?.items ?? [];
    expect(carried.filter((item) => item.id === SWORD_ID)).toHaveLength(1);
    expect(
      carried.find((item) => item.id === SWORD_ID)?.location,
    ).toMatchObject({ slot: 3 });
    expect(harness.loadForCharacter).toHaveBeenCalledWith(CHARACTER_ID);
    expect(
      harness.messages.some((message) => message.type === "inventory-updated"),
    ).toBe(true);
    expect(harness.session.itemPersistsPending).toBe(0);
  });

  it("skips the character's queued writes until the reload lands", async () => {
    const harness = makeHarness();
    attachCaches(harness);
    failingMove(harness);
    await nextTurn();
    harness.items.applyResolvedOutcomes(Date.now());

    // Still poisoned while the reload is in flight, so nothing can commit the
    // diverged memory state.
    expect(harness.items.isPersistPoisoned(CHARACTER_ID)).toBe(true);

    await harness.resync.stop();
    harness.resync.applyResolvedOutcomes();
    expect(harness.items.isPersistPoisoned(CHARACTER_ID)).toBe(false);
  });

  it("disconnects when the reload itself fails", async () => {
    const harness = makeHarness({
      loadDepot: async () => {
        throw new Error("db still down");
      },
    });
    attachCaches(harness);
    failingMove(harness);

    await settle(harness);

    expect(harness.terminate).toHaveBeenCalled();
  });

  it("does not overwrite caches when the session is no longer the live one", async () => {
    const harness = makeHarness();
    attachCaches(harness);
    failingMove(harness);
    await nextTurn();
    harness.items.applyResolvedOutcomes(Date.now());
    // The player relogged mid-reload: the registry now points elsewhere.
    harness.registry.remove(harness.session);

    await harness.resync.stop();
    harness.resync.applyResolvedOutcomes();

    // The stale reload left the live caches alone.
    expect(
      harness.items
        .inventorySnapshot(CHARACTER_ID)
        ?.items.find((item) => item.id === SWORD_ID)?.location,
    ).toMatchObject({ slot: 0 });
  });
});
