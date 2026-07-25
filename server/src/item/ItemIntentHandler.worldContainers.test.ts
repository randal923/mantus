import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Position, ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { Player } from "../Player";
import { Session } from "../Session";
import { gridMapData } from "../gridMapData";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { DecayManager } from "./DecayManager";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { ItemIntentHandler } from "./ItemIntentHandler";
import { loadItemCatalog } from "./loadItemCatalog";
import { MemoryItemStore } from "./MemoryItemStore";
import type { WorldItemSource } from "./WorldItemSource";

const LOOTER_ID = "3d2af45f-e037-44f5-bd50-7bc655c6cd0e";
const RIVAL_ID = "9c1de0aa-1111-4222-8333-abcdefabcdef";
const LOOTER_BACKPACK_ID = "41868798-fc9b-43ac-bf28-4f52bf64c4eb";
const RIVAL_BACKPACK_ID = "52979809-0dac-44bd-9c39-5063c075d5fc";
const CORPSE_TYPE = 6042;
const BACKPACK_TYPE = 2854;
const CHEST_TYPE = 2472;
const GOLD_TYPE = 3031;
const AXE_TYPE = 3274;
const CHEESE_TYPE = 3607;
const CORPSE_POSITION = { x: 1, y: 2, z: 7 };
const SECOND_CORPSE_POSITION = { x: 2, y: 1, z: 7 };
const CHEST_POSITION = { x: 2, y: 2, z: 7 };
const CHEST_SEED_KEY = "world:2:2:7:0";
const MAP_NAME = "world-containers-test";
const MAP_VERSION = "test-version";

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function makeSession(characterId: string): {
  session: Session;
  sent: ServerMessage[];
} {
  const sent: ServerMessage[] = [];
  const socket = {
    OPEN: 1,
    readyState: 1,
    on: vi.fn(),
    send: vi.fn((value: string) => {
      sent.push(JSON.parse(value) as ServerMessage);
    }),
  } as unknown as WebSocket;
  const session = new Session(characterId, "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = characterId;
  return { session, sent };
}

function backpackFor(characterId: string, backpackId: string): Item {
  return {
    id: backpackId,
    typeId: BACKPACK_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "equipment", characterId, slot: "backpack" },
  };
}

/** A pristine map chest holding a stack of gold and an axe. */
const chestSource: WorldItemSource = {
  seedKey: CHEST_SEED_KEY,
  mapName: MAP_NAME,
  mapVersion: MAP_VERSION,
  typeId: CHEST_TYPE,
  attributes: {},
  position: CHEST_POSITION,
  stackIndex: 0,
  contents: [
    { typeId: GOLD_TYPE, attributes: { count: 25 }, contents: [] },
    { typeId: AXE_TYPE, attributes: {}, contents: [] },
  ],
};

async function makeHarness(
  options: { readonly loot?: ReadonlyArray<{ typeId: number; count: number }> } = {},
) {
  const world = new World(
    gridMapData({
      name: MAP_NAME,
      width: 12,
      height: 12,
      blocked: [],
      items: [
        {
          position: CHEST_POSITION,
          item: {
            instanceId: CHEST_SEED_KEY,
            itemId: CHEST_TYPE,
            stackIndex: 0,
            mutable: true,
            source: chestSource,
          },
        },
      ],
    }),
    25,
  );
  const registry = {
    all: () => [],
    sessionFor: () => undefined,
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const store = new MemoryItemStore(catalog);
  store.seed(backpackFor(LOOTER_ID, LOOTER_BACKPACK_ID));
  store.seed(backpackFor(RIVAL_ID, RIVAL_BACKPACK_ID));
  const items = new ItemIntentHandler(
    store,
    catalog,
    world,
    visibility,
    new DecayManager(catalog),
  );
  const looter = new Player(makeCharacter(LOOTER_ID, "Looter"), {
    x: 1,
    y: 1,
    z: 7,
  });
  const rival = new Player(makeCharacter(RIVAL_ID, "Rival"), {
    x: 2,
    y: 3,
    z: 7,
  });
  world.addPlayer(looter);
  world.addPlayer(rival);
  items.attach(await items.load(LOOTER_ID, 400));
  items.attach(await items.load(RIVAL_ID, 400));
  items.createCorpse(
    LOOTER_ID,
    "death:test-1",
    CORPSE_POSITION,
    0,
    CORPSE_TYPE,
    options.loot ?? [
      { typeId: GOLD_TYPE, count: 10 },
      { typeId: BACKPACK_TYPE, count: 1 },
    ],
    0,
  );
  await settle(items);
  return {
    world,
    store,
    items,
    looter: { ...makeSession(LOOTER_ID), player: looter },
    rival: { ...makeSession(RIVAL_ID), player: rival },
  };
}

async function settle(items: ItemIntentHandler): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  items.applyResolvedOutcomes(0);
}

function containerAt(world: World, position: Position): Item {
  const [mapItem] = world.getMapItems(position);
  const container = mapItem ? world.getWorldItem(mapItem.instanceId) : undefined;
  if (!container) throw new Error("no container at position");
  return container;
}

function childrenOf(world: World, containerId: string): Item[] {
  return world
    .getWorldSubtree(containerId)
    .filter(
      (item) =>
        (item.location.kind === "corpse" ||
          item.location.kind === "container") &&
        item.location.containerId === containerId,
    );
}

/** Places `typeId` inside an existing memory-only container, loot-style. */
function nest(world: World, containerId: string, typeId: number): Item {
  const item: Item = {
    id: randomUUID(),
    typeId,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId, slot: 0 },
  };
  world.applyCreatedWorldItems([item]);
  world.registerUnpersistedLootItems([item], {
    eventId: "death:test-1",
    killerCharacterId: LOOTER_ID,
  });
  return item;
}

function lastState(sent: ReadonlyArray<ServerMessage>) {
  return [...sent]
    .reverse()
    .find((message) => message.type === "world-container-state");
}

describe("nested world container views", () => {
  it("browses a bag inside a corpse in place and loots out of it", async () => {
    const harness = await makeHarness();
    const corpse = containerAt(harness.world, CORPSE_POSITION);
    const bag = childrenOf(harness.world, corpse.id).find(
      (item) => item.typeId === BACKPACK_TYPE,
    );
    if (!bag) throw new Error("expected a bag in the corpse");
    const cheese = nest(harness.world, bag.id, CHEESE_TYPE);
    harness.items.handleMapOpen(harness.looter.session, CORPSE_POSITION);

    harness.items.handle(harness.looter.session, {
      type: "open-world-container",
      containerId: bag.id,
      revision: bag.version,
    });

    expect(lastState(harness.looter.sent)).toMatchObject({
      type: "world-container-state",
      position: CORPSE_POSITION,
      state: {
        container: { id: bag.id },
        parentContainerId: corpse.id,
        items: [{ slot: 0, item: { id: cheese.id } }],
      },
    });

    // Looting names the nested view; the plan still works from the world root.
    harness.items.handle(harness.looter.session, {
      type: "loot-item",
      itemId: cheese.id,
      revision: cheese.version,
      containerId: bag.id,
    });

    expect(
      harness.looter.sent.some((message) => message.type === "error"),
    ).toBe(false);
    expect(childrenOf(harness.world, bag.id)).toEqual([]);
  });

  it("refuses to open a container that is not inside an open view", async () => {
    const harness = await makeHarness();
    const corpse = containerAt(harness.world, CORPSE_POSITION);
    const bag = childrenOf(harness.world, corpse.id).find(
      (item) => item.typeId === BACKPACK_TYPE,
    );
    if (!bag) throw new Error("expected a bag in the corpse");

    harness.items.handle(harness.looter.session, {
      type: "open-world-container",
      containerId: bag.id,
      revision: bag.version,
    });

    expect(harness.looter.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
  });

  it("closes a nested view when its container leaves the corpse", async () => {
    const harness = await makeHarness();
    const corpse = containerAt(harness.world, CORPSE_POSITION);
    const bag = childrenOf(harness.world, corpse.id).find(
      (item) => item.typeId === BACKPACK_TYPE,
    );
    if (!bag) throw new Error("expected a bag in the corpse");
    harness.items.handleMapOpen(harness.looter.session, CORPSE_POSITION);
    harness.items.handle(harness.looter.session, {
      type: "open-world-container",
      containerId: bag.id,
      revision: bag.version,
    });

    harness.items.handle(harness.looter.session, {
      type: "loot-item",
      itemId: bag.id,
      revision: bag.version,
      containerId: corpse.id,
    });
    harness.items.tickWorldContainers();

    expect(harness.looter.sent).toContainEqual({
      type: "world-container-closed",
      containerId: bag.id,
    });
  });

  it("keeps several world containers open at once, bounded per session", async () => {
    const harness = await makeHarness();
    harness.items.createCorpse(
      LOOTER_ID,
      "death:test-2",
      SECOND_CORPSE_POSITION,
      0,
      CORPSE_TYPE,
      [{ typeId: GOLD_TYPE, count: 3 }],
      0,
    );
    await settle(harness.items);
    const first = containerAt(harness.world, CORPSE_POSITION);
    const second = containerAt(harness.world, SECOND_CORPSE_POSITION);

    harness.items.handleMapOpen(harness.looter.session, CORPSE_POSITION);
    harness.items.handleMapOpen(harness.looter.session, SECOND_CORPSE_POSITION);
    harness.looter.sent.length = 0;
    // Both views reconcile every tick, so a change in either reaches the viewer.
    nest(harness.world, first.id, CHEESE_TYPE);
    nest(harness.world, second.id, CHEESE_TYPE);
    harness.items.tickWorldContainers();

    const states = harness.looter.sent.filter(
      (message) => message.type === "world-container-state",
    );
    expect(
      states.map((message) =>
        message.type === "world-container-state"
          ? message.state.container.id
          : "",
      ),
    ).toEqual([first.id, second.id]);
  });

  it("closes every view when the player walks out of reach", async () => {
    const harness = await makeHarness();
    const corpse = containerAt(harness.world, CORPSE_POSITION);
    const bag = childrenOf(harness.world, corpse.id).find(
      (item) => item.typeId === BACKPACK_TYPE,
    );
    if (!bag) throw new Error("expected a bag in the corpse");
    harness.items.handleMapOpen(harness.looter.session, CORPSE_POSITION);
    harness.items.handle(harness.looter.session, {
      type: "open-world-container",
      containerId: bag.id,
      revision: bag.version,
    });

    harness.looter.player.moveTo({ x: 9, y: 9, z: 7 });
    harness.items.tickWorldContainers();

    expect(harness.looter.sent).toContainEqual({
      type: "world-container-closed",
      containerId: corpse.id,
    });
    expect(harness.looter.sent).toContainEqual({
      type: "world-container-closed",
      containerId: bag.id,
    });
    // A view the server closed no longer authorizes looting.
    harness.items.handle(harness.looter.session, {
      type: "loot-item",
      itemId: bag.id,
      revision: bag.version,
      containerId: corpse.id,
    });
    expect(harness.looter.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
  });
});

describe("quick loot", () => {
  it("sweeps an open corpse into the backpack", async () => {
    const harness = await makeHarness({
      loot: [
        { typeId: GOLD_TYPE, count: 7 },
        { typeId: CHEESE_TYPE, count: 2 },
      ],
    });
    const corpse = containerAt(harness.world, CORPSE_POSITION);
    harness.items.handleMapOpen(harness.looter.session, CORPSE_POSITION);

    harness.items.handle(harness.looter.session, {
      type: "quick-loot",
      containerId: corpse.id,
    });

    expect(
      harness.looter.sent.some((message) => message.type === "error"),
    ).toBe(false);
    expect(childrenOf(harness.world, corpse.id)).toEqual([]);
  });

  it("takes only the named category when one is given", async () => {
    const harness = await makeHarness({
      loot: [
        { typeId: GOLD_TYPE, count: 7 },
        { typeId: CHEESE_TYPE, count: 2 },
      ],
    });
    const corpse = containerAt(harness.world, CORPSE_POSITION);
    harness.items.handleMapOpen(harness.looter.session, CORPSE_POSITION);

    harness.items.handle(harness.looter.session, {
      type: "quick-loot",
      containerId: corpse.id,
      category: "gold",
    });

    expect(
      childrenOf(harness.world, corpse.id).map((item) => item.typeId),
    ).toEqual([CHEESE_TYPE]);
  });

  it("refuses a sweep of a container this session has not opened", async () => {
    const harness = await makeHarness();
    const corpse = containerAt(harness.world, CORPSE_POSITION);

    harness.items.handle(harness.looter.session, {
      type: "quick-loot",
      containerId: corpse.id,
    });

    expect(harness.looter.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(childrenOf(harness.world, corpse.id)).toHaveLength(2);
  });

  it("refuses a sweep of another player's protected corpse", async () => {
    const harness = await makeHarness();
    const corpse = containerAt(harness.world, CORPSE_POSITION);
    harness.items.handleMapOpen(harness.looter.session, CORPSE_POSITION);

    harness.items.handle(harness.rival.session, {
      type: "quick-loot",
      containerId: corpse.id,
    });

    expect(harness.rival.sent.at(-1)).toMatchObject({
      type: "error",
      code: "loot-protected",
    });
    expect(childrenOf(harness.world, corpse.id)).toHaveLength(2);
  });
});

describe("pristine map chests", () => {
  it("materializes a seeded chest on open without writing any row", async () => {
    const harness = await makeHarness();

    expect(
      harness.items.handleMapOpen(harness.looter.session, CHEST_POSITION),
    ).toBe(true);

    const state = lastState(harness.looter.sent);
    expect(state).toMatchObject({
      type: "world-container-state",
      position: CHEST_POSITION,
      state: {
        items: [
          { slot: 0, item: { typeId: GOLD_TYPE, count: 25 } },
          { slot: 1, item: { typeId: AXE_TYPE } },
        ],
      },
    });
    // Memory-first, exactly like a corpse: opening writes nothing.
    await harness.items.stopPersists();
    expect(harness.store.allItems().map((item) => item.typeId)).toEqual([
      BACKPACK_TYPE,
      BACKPACK_TYPE,
    ]);
  });

  it("hands the same chest to two openers without duplicating its contents", async () => {
    const harness = await makeHarness();
    harness.rival.player.moveTo({ x: 2, y: 3, z: 7 });

    harness.items.handleMapOpen(harness.looter.session, CHEST_POSITION);
    harness.items.handleMapOpen(harness.rival.session, CHEST_POSITION);

    const chest = containerAt(harness.world, CHEST_POSITION);
    const contents = childrenOf(harness.world, chest.id);
    expect(contents).toHaveLength(2);
    expect(lastState(harness.rival.sent)).toMatchObject({
      state: { container: { id: chest.id } },
    });

    // Both race for the gold; exactly one take can succeed.
    const gold = contents.find((item) => item.typeId === GOLD_TYPE);
    if (!gold) throw new Error("expected gold in the chest");
    for (const peer of [harness.looter, harness.rival]) {
      harness.items.handle(peer.session, {
        type: "loot-item",
        itemId: gold.id,
        revision: gold.version,
        containerId: chest.id,
      });
    }

    await harness.items.stopPersists();
    const rows = harness.store
      .allItems()
      .filter((item) => item.typeId === GOLD_TYPE);
    expect(rows).toHaveLength(1);
    expect(childrenOf(harness.world, chest.id).map((item) => item.typeId)).toEqual([
      AXE_TYPE,
    ]);
  });

  it("does not re-create a chest item that was already taken", async () => {
    const harness = await makeHarness();
    harness.items.handleMapOpen(harness.looter.session, CHEST_POSITION);
    const chest = containerAt(harness.world, CHEST_POSITION);
    const gold = childrenOf(harness.world, chest.id).find(
      (item) => item.typeId === GOLD_TYPE,
    );
    if (!gold) throw new Error("expected gold in the chest");

    harness.items.handle(harness.looter.session, {
      type: "loot-item",
      itemId: gold.id,
      revision: gold.version,
      containerId: chest.id,
    });
    await harness.items.stopPersists();

    // The taken content's seed key is hidden now, so a fresh materialization
    // of the same seed — a restart, or a second server — cannot hand it out
    // again.
    expect(harness.world.isSeedHidden(`${CHEST_SEED_KEY}:content:0`)).toBe(true);
    expect(harness.world.isSeedHidden(`${CHEST_SEED_KEY}:content:1`)).toBe(
      false,
    );
  });
});
