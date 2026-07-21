import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Position, ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { gridMapData } from "../gridMapData";
import type { ItemCatalog } from "../item/ItemCatalog";
import { ItemIntentHandler } from "../item/ItemIntentHandler";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { MemoryItemStore } from "../item/MemoryItemStore";
import type { MapItem } from "../MapItem";
import { Player } from "../Player";
import { positionKey } from "../positionKey";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { WorldActionRegistry } from "./WorldActionRegistry";

const CLOSED_DOOR = 1_638;
const OPEN_DOOR = 1_639;
const LOCKED_KEY_DOOR = 1_628;
const CLOSED_QUEST_DOOR = 1_642;
const CLOSED_LEVEL_DOOR = 1_646;
const OPEN_LEVEL_DOOR = 1_647;
const LEVER_OFF = 2_772;
const LEVER_ON = 2_773;
const ROTATABLE_STATUE = 2_025;
const ROTATED_STATUE = 2_059;
const STATUE_WITH_TEXT = 15_633;
const DISTANCE_BLACKBOARD = 2_598;

const TILE = { x: 5, y: 4, z: 7 } as const;

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function seededMapItem(
  itemId: number,
  position: Position,
  attributes: Record<string, unknown> = {},
): MapItem {
  const instanceId = `test:${position.x}:${position.y}:${position.z}:1`;
  return {
    instanceId,
    itemId,
    stackIndex: 1,
    mutable: true,
    source: {
      seedKey: instanceId,
      mapName: "test",
      mapVersion: "v1",
      typeId: itemId,
      attributes,
      position: { ...position },
      stackIndex: 1,
      contents: [],
    },
  };
}

function makeHarness(options: {
  items: ReadonlyArray<{ position: Position; item: MapItem }>;
  blocked?: ReadonlyArray<readonly [number, number]>;
  doorLevels?: ReadonlyMap<string, number>;
}) {
  const world = new World(
    gridMapData({
      name: "test",
      width: 10,
      height: 8,
      blocked: options.blocked ?? [],
      items: [...options.items],
    }),
    25,
    undefined,
    (itemId) => catalog.get(itemId)?.weight,
    (itemId) => {
      const door = catalog.get(itemId)?.door;
      return door ? door.role === "open" : undefined;
    },
  );
  const registry = new SessionRegistry();
  const store = new MemoryItemStore();
  const items = new ItemIntentHandler(
    store,
    catalog,
    world,
    new Visibility(world, registry),
  );
  const worldActions = new WorldActionRegistry(
    world,
    catalog,
    items,
    options.doorLevels ?? new Map(),
  );
  const makeSession = async (
    characterId: string,
    position: Position,
    level = 1,
  ) => {
    const player = new Player(
      {
        ...makeCharacter(characterId),
        level,
        experience: BigInt(getExperienceForLevel(level)),
      },
      position,
    );
    world.addPlayer(player);
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
    registry.add(session);
    items.attach(await items.load(characterId, 400));
    return { player, session, sent };
  };
  return { world, store, items, worldActions, makeSession };
}

const tileItemIds = (harness: { world: World }, position: Position) =>
  harness.world.getMapItems(position).map((item) => item.itemId);

describe("WorldActionRegistry doors", () => {
  it("opens and closes a plain door, flipping walkability, with one item row", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(CLOSED_DOOR, TILE) }],
      blocked: [[TILE.x, TILE.y]],
    });
    const { player, session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });
    expect(harness.world.isWalkable(TILE)).toBe(false);
    expect(harness.world.tryMove(player, "north", 1_000).moved).toBe(false);

    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(tileItemIds(harness, TILE)).toEqual([OPEN_DOOR]);
    expect(harness.world.isWalkable(TILE)).toBe(true);
    expect(harness.world.tryMove(player, "north", 2_000).moved).toBe(true);
    expect(player.position).toEqual(TILE);

    // Walk off, then close it from the adjacent tile.
    expect(harness.world.tryMove(player, "south", 3_000).moved).toBe(true);
    expect(harness.worldActions.handleUseMap(session, TILE, 4_000)).toBe(true);
    expect(tileItemIds(harness, TILE)).toEqual([CLOSED_DOOR]);
    expect(harness.world.isWalkable(TILE)).toBe(false);

    await harness.items.stopPersists();
    const rows = harness.store.allItems();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ typeId: CLOSED_DOOR, version: 3 });
    expect(sent.filter((message) => message.type === "error")).toHaveLength(0);
  });

  it("refuses to close a door onto a creature in the doorway", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(OPEN_DOOR, TILE) }],
    });
    const { session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });
    await harness.makeSession("blocker", TILE);

    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(tileItemIds(harness, TILE)).toEqual([OPEN_DOOR]);
    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
  });

  it("keeps locked doors locked and quest doors fail-closed", async () => {
    const lockedTile = { x: 3, y: 4, z: 7 };
    const questTile = { x: 7, y: 4, z: 7 };
    const harness = makeHarness({
      items: [
        { position: lockedTile, item: seededMapItem(LOCKED_KEY_DOOR, lockedTile) },
        { position: questTile, item: seededMapItem(CLOSED_QUEST_DOOR, questTile) },
      ],
    });
    const locksmith = await harness.makeSession("locksmith", {
      x: 3,
      y: 5,
      z: 7,
    });
    expect(
      harness.worldActions.handleUseMap(locksmith.session, lockedTile, 1_000),
    ).toBe(true);
    expect(locksmith.sent.at(-1)).toMatchObject({
      type: "combat-log",
      text: "It is locked.",
    });
    expect(tileItemIds(harness, lockedTile)).toEqual([LOCKED_KEY_DOOR]);

    const quester = await harness.makeSession("quester", { x: 7, y: 5, z: 7 });
    expect(
      harness.worldActions.handleUseMap(quester.session, questTile, 1_000),
    ).toBe(true);
    expect(quester.sent.at(-1)).toMatchObject({
      type: "combat-log",
      text: "The door seems to be sealed against unwanted intruders.",
    });
    expect(tileItemIds(harness, questTile)).toEqual([CLOSED_QUEST_DOOR]);
  });

  it("gates level doors on the imported requirement and closes them behind the player", async () => {
    const doorLevels = new Map([[positionKey(TILE), 20]]);
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(CLOSED_LEVEL_DOOR, TILE) }],
      blocked: [[TILE.x, TILE.y]],
      doorLevels,
    });
    const novice = await harness.makeSession("novice", { x: 5, y: 5, z: 7 }, 19);
    expect(
      harness.worldActions.handleUseMap(novice.session, TILE, 1_000),
    ).toBe(true);
    expect(novice.sent.at(-1)).toMatchObject({
      type: "combat-log",
      text: "Only the worthy may pass.",
    });
    expect(tileItemIds(harness, TILE)).toEqual([CLOSED_LEVEL_DOOR]);

    const veteran = await harness.makeSession(
      "veteran",
      { x: 4, y: 4, z: 7 },
      20,
    );
    expect(
      harness.worldActions.handleUseMap(veteran.session, TILE, 2_000),
    ).toBe(true);
    expect(tileItemIds(harness, TILE)).toEqual([OPEN_LEVEL_DOOR]);

    // Pass through: step onto the door, then off; it closes behind them.
    expect(harness.world.tryMove(veteran.player, "east", 3_000).moved).toBe(true);
    harness.worldActions.closeDoorBehind(
      veteran.session,
      veteran.player,
      { x: 4, y: 4, z: 7 },
      3_000,
    );
    expect(tileItemIds(harness, TILE)).toEqual([OPEN_LEVEL_DOOR]);
    expect(harness.world.tryMove(veteran.player, "east", 4_000).moved).toBe(true);
    harness.worldActions.closeDoorBehind(
      veteran.session,
      veteran.player,
      TILE,
      4_000,
    );
    expect(tileItemIds(harness, TILE)).toEqual([CLOSED_LEVEL_DOOR]);
    expect(harness.world.isWalkable(TILE)).toBe(false);
  });

  it("fails closed on level doors with no imported requirement", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(CLOSED_LEVEL_DOOR, TILE) }],
    });
    const { session, sent } = await harness.makeSession(
      "hero",
      { x: 5, y: 5, z: 7 },
      500,
    );
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(sent.at(-1)).toMatchObject({
      type: "combat-log",
      text: "Only the worthy may pass.",
    });
    expect(tileItemIds(harness, TILE)).toEqual([CLOSED_LEVEL_DOOR]);
  });

  it("resolves two players racing one pristine door to exactly one item row", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(CLOSED_DOOR, TILE) }],
      blocked: [[TILE.x, TILE.y]],
    });
    const first = await harness.makeSession("first", { x: 5, y: 5, z: 7 });
    const second = await harness.makeSession("second", { x: 4, y: 4, z: 7 });

    expect(
      harness.worldActions.handleUseMap(first.session, TILE, 1_000),
    ).toBe(true);
    expect(
      harness.worldActions.handleUseMap(second.session, TILE, 1_000),
    ).toBe(true);

    // The second use re-resolved current state (open) and closed it again.
    expect(tileItemIds(harness, TILE)).toEqual([CLOSED_DOOR]);
    await harness.items.stopPersists();
    const rows = harness.store.allItems();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ typeId: CLOSED_DOOR, version: 3 });
  });
});

describe("WorldActionRegistry levers, rotation, and signs", () => {
  it("flips a bare lever both ways", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(LEVER_OFF, TILE) }],
    });
    const { session } = await harness.makeSession("actor", { x: 5, y: 5, z: 7 });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(tileItemIds(harness, TILE)).toEqual([LEVER_ON]);
    expect(harness.worldActions.handleUseMap(session, TILE, 2_000)).toBe(true);
    expect(tileItemIds(harness, TILE)).toEqual([LEVER_OFF]);
  });

  it("fails closed on quest-scripted levers and unique-id placements", async () => {
    const scriptedLever = { x: 3, y: 4, z: 7 };
    const uniqueStatue = { x: 7, y: 4, z: 7 };
    const harness = makeHarness({
      items: [
        {
          position: scriptedLever,
          item: seededMapItem(LEVER_OFF, scriptedLever, { actionId: 40_001 }),
        },
        {
          position: uniqueStatue,
          item: seededMapItem(ROTATABLE_STATUE, uniqueStatue, {
            uniqueId: 9_001,
          }),
        },
      ],
    });
    const left = await harness.makeSession("left", { x: 3, y: 5, z: 7 });
    expect(
      harness.worldActions.handleUseMap(left.session, scriptedLever, 1_000),
    ).toBe(true);
    expect(left.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(tileItemIds(harness, scriptedLever)).toEqual([LEVER_OFF]);

    const right = await harness.makeSession("right", { x: 7, y: 5, z: 7 });
    expect(
      harness.worldActions.handleUseMap(right.session, uniqueStatue, 1_000),
    ).toBe(true);
    expect(right.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
  });

  it("rotates map furniture through its catalog rotateTo target", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(ROTATABLE_STATUE, TILE) }],
    });
    const { session } = await harness.makeSession("actor", { x: 5, y: 5, z: 7 });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(tileItemIds(harness, TILE)).toEqual([ROTATED_STATUE]);
    await harness.items.stopPersists();
    expect(harness.store.allItems()[0]).toMatchObject({
      typeId: ROTATED_STATUE,
      version: 2,
    });
  });

  it("reads adjacent map text and enforces the distance rule", async () => {
    const statueTile = { x: 5, y: 4, z: 7 };
    const boardTile = { x: 8, y: 4, z: 7 };
    const harness = makeHarness({
      items: [
        {
          position: statueTile,
          item: seededMapItem(STATUE_WITH_TEXT, statueTile, {
            text: "hewn in stone",
          }),
        },
        {
          position: boardTile,
          item: seededMapItem(DISTANCE_BLACKBOARD, boardTile, {
            text: "chalk notes",
          }),
        },
      ],
    });
    const near = await harness.makeSession("near", { x: 5, y: 5, z: 7 });
    expect(
      harness.worldActions.handleUseMap(near.session, statueTile, 1_000),
    ).toBe(true);
    expect(near.sent.at(-1)).toMatchObject({
      type: "item-text",
      text: "hewn in stone",
      writeable: false,
    });

    // The statue is not distance-readable; the blackboard is.
    const far = await harness.makeSession("far", { x: 1, y: 4, z: 7 });
    expect(
      harness.worldActions.handleUseMap(far.session, statueTile, 2_000),
    ).toBe(true);
    expect(far.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(
      harness.worldActions.handleUseMap(far.session, boardTile, 3_000),
    ).toBe(true);
    expect(far.sent.at(-1)).toMatchObject({
      type: "item-text",
      text: "chalk notes",
    });
  });
});

describe("WorldActionRegistry fail-closed routing", () => {
  it("rejects door use from beyond reach", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(CLOSED_DOOR, TILE) }],
    });
    const { session, sent } = await harness.makeSession("far", {
      x: 1,
      y: 1,
      z: 7,
    });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(tileItemIds(harness, TILE)).toEqual([CLOSED_DOOR]);
  });

  it("answers out-of-view probes exactly like empty tiles", async () => {
    const farTile = { x: 25, y: 4, z: 7 };
    const world = new World(
      gridMapData({
        name: "wide",
        width: 30,
        height: 8,
        blocked: [],
        items: [{ position: farTile, item: seededMapItem(CLOSED_DOOR, farTile) }],
      }),
      25,
      undefined,
      (itemId) => catalog.get(itemId)?.weight,
    );
    const registry = new SessionRegistry();
    const items = new ItemIntentHandler(
      new MemoryItemStore(),
      catalog,
      world,
      new Visibility(world, registry),
    );
    const worldActions = new WorldActionRegistry(world, catalog, items, new Map());
    const player = new Player(makeCharacter("prober"), { x: 1, y: 1, z: 7 });
    world.addPlayer(player);
    const sent: ServerMessage[] = [];
    const socket = {
      OPEN: 1,
      readyState: 1,
      on: vi.fn(),
      send: vi.fn((value: string) => {
        sent.push(JSON.parse(value) as ServerMessage);
      }),
    } as unknown as WebSocket;
    const session = new Session("prober", "127.0.0.1", socket, {
      maxPendingIntents: 16,
      maxProtocolViolations: 5,
      initialViewRange: { x: 9, y: 7 },
    });
    session.playerId = "prober";

    expect(worldActions.handleUseMap(session, farTile, 1_000)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("leaves plain tiles and ladder tiles to the movement path", async () => {
    const ladderTile = { x: 5, y: 4, z: 7 };
    const harness = makeHarness({ items: [] });
    const { session } = await harness.makeSession("actor", { x: 5, y: 5, z: 7 });
    expect(
      harness.worldActions.handleUseMap(session, { x: 4, y: 5, z: 7 }, 1_000),
    ).toBe(false);

    const ladderWorld = new World(
      gridMapData({
        name: "ladder",
        width: 10,
        height: 8,
        blocked: [],
        floors: [6, 7],
        actions: [
          {
            kind: "ladder",
            activation: "use",
            source: ladderTile,
            destination: { x: 5, y: 5, z: 6 },
            itemId: 1_948,
          },
        ],
      }),
      25,
    );
    const ladderRegistry = new WorldActionRegistry(
      ladderWorld,
      catalog,
      harness.items,
      new Map(),
    );
    const ladderPlayer = new Player(makeCharacter("climber"), {
      x: 5,
      y: 5,
      z: 7,
    });
    ladderWorld.addPlayer(ladderPlayer);
    session.playerId = "climber";
    expect(ladderRegistry.handleUseMap(session, ladderTile, 1_000)).toBe(false);
  });
});
