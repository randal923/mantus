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
import type { ChestDefinition } from "./ChestDefinition";
import { WorldActionRegistry } from "./WorldActionRegistry";

const CLOSED_DOOR = 1_638;
const OPEN_DOOR = 1_639;
const LOCKED_KEY_DOOR = 1_628;
const CLOSED_QUEST_DOOR = 1_642;
const CLOSED_LEVEL_DOOR = 1_646;
const OPEN_LEVEL_DOOR = 1_647;
const CLOSED_DARASHIA_LEVEL_DOOR = 5_293;
const OPEN_DARASHIA_LEVEL_DOOR = 5_294;
const REWARD_WALL = 25_802;
const FLOOR_SHRINE = 25_720;
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
  chests?: ReadonlyMap<string, ChestDefinition>;
  width?: number;
  decorateAccess?: (characterId: string, position: Position) => boolean;
}) {
  const lootedChests: Array<{ characterId: string; uniqueId: number }> = [];
  const openedShrines: Array<{ characterId: string; position: Position }> = [];
  const world = new World(
    gridMapData({
      name: "test",
      width: options.width ?? 10,
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
    undefined,
    options.chests ?? new Map(),
    (_session, player, chest) => {
      lootedChests.push({ characterId: player.id, uniqueId: chest.uniqueId });
    },
    undefined,
    undefined,
    (_session, player, position) => {
      openedShrines.push({ characterId: player.id, position });
    },
    undefined,
    options.decorateAccess,
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
  return {
    world,
    store,
    items,
    worldActions,
    makeSession,
    lootedChests,
    openedShrines,
  };
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

  it("prefers an imported level-door requirement over the embedded map action id", async () => {
    const doorLevels = new Map([[positionKey(TILE), 40]]);
    const harness = makeHarness({
      items: [
        {
          position: TILE,
          item: seededMapItem(CLOSED_LEVEL_DOOR, TILE, { actionId: 1_030 }),
        },
      ],
      blocked: [[TILE.x, TILE.y]],
      doorLevels,
    });
    const novice = await harness.makeSession("novice", { x: 5, y: 5, z: 7 }, 39);
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
      40,
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

  it("gates an embedded-action level door when no startup override exists", async () => {
    const harness = makeHarness({
      items: [
        {
          position: TILE,
          item: seededMapItem(CLOSED_DARASHIA_LEVEL_DOOR, TILE, {
            actionId: 1_040,
          }),
        },
      ],
      blocked: [[TILE.x, TILE.y]],
    });
    const novice = await harness.makeSession("novice", { x: 5, y: 5, z: 7 }, 39);
    expect(
      harness.worldActions.handleUseMap(novice.session, TILE, 1_000),
    ).toBe(true);
    expect(novice.sent.at(-1)).toMatchObject({
      type: "combat-log",
      text: "Only the worthy may pass.",
    });
    expect(tileItemIds(harness, TILE)).toEqual([CLOSED_DARASHIA_LEVEL_DOOR]);

    const veteran = await harness.makeSession(
      "veteran",
      { x: 4, y: 4, z: 7 },
      40,
    );
    expect(
      harness.worldActions.handleUseMap(veteran.session, TILE, 2_000),
    ).toBe(true);
    expect(tileItemIds(harness, TILE)).toEqual([OPEN_DARASHIA_LEVEL_DOOR]);
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

  it("opens the reward wall from an adjacent tile", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(REWARD_WALL, TILE) }],
    });
    const { session, player } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(harness.openedShrines).toEqual([
      { characterId: player.id, position: TILE },
    ]);
    // The wall is scenery: opening the window never consumes or changes it.
    expect(tileItemIds(harness, TILE)).toEqual([REWARD_WALL]);
  });

  it("prefers the shrine window over the floor shrine's rotate behaviour", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(FLOOR_SHRINE, TILE) }],
    });
    const { session } = await harness.makeSession("actor", { x: 5, y: 5, z: 7 });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(harness.openedShrines).toHaveLength(1);
    expect(tileItemIds(harness, TILE)).toEqual([FLOOR_SHRINE]);
  });

  it("fails closed on a quest-scripted reward shrine", async () => {
    const harness = makeHarness({
      items: [
        {
          position: TILE,
          item: seededMapItem(REWARD_WALL, TILE, { uniqueId: 9_002 }),
        },
      ],
    });
    const { session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(harness.openedShrines).toEqual([]);
  });

  it("rejects reward wall use from beyond reach", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(REWARD_WALL, TILE) }],
    });
    const { session } = await harness.makeSession("actor", { x: 8, y: 7, z: 7 });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(harness.openedShrines).toEqual([]);
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

  it("reports the world time from a clock instead of rotating it", async () => {
    const PENDULUM_CLOCK = 2_445;
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(PENDULUM_CLOCK, TILE) }],
    });
    const { session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });

    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(sent.at(-1)).toMatchObject({
      type: "combat-log",
      text: expect.stringMatching(/^The time is \d{1,2}:\d{2}\.$/) as unknown,
    });
    // Rotation never happened: the clock still has its original type.
    expect(tileItemIds(harness, TILE)).toEqual([PENDULUM_CLOCK]);
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
      // Both pinned types are writeable, so the client is offered the editor.
      writeable: true,
      maxLength: 249,
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

describe("WorldActionRegistry chests", () => {
  const CHEST_ITEM = 2_472;
  const chestAt = (position: Position): ReadonlyMap<string, ChestDefinition> =>
    new Map([
      [
        positionKey(position),
        {
          uniqueId: 5_000,
          itemTypeId: CHEST_ITEM,
          lootedKey: "chest-storage:3980",
          reward: [{ typeId: 3_031, count: 1 }],
        },
      ],
    ]);

  it("routes a registered chest ahead of the container and rotate paths", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(CHEST_ITEM, TILE) }],
      chests: chestAt(TILE),
    });
    const { session } = await harness.makeSession("actor", { x: 5, y: 5, z: 7 });

    expect(harness.worldActions.handleChestUse(session, TILE, 1_000)).toBe(true);
    expect(harness.lootedChests).toEqual([
      { characterId: "actor", uniqueId: 5_000 },
    ]);
    // The chest was not rotated by the generic rotate arm.
    expect(tileItemIds(harness, TILE)).toEqual([CHEST_ITEM]);
  });

  it("rejects a forged position that carries no registered chest", async () => {
    const decoy = { x: 3, y: 4, z: 7 };
    const harness = makeHarness({
      items: [
        { position: TILE, item: seededMapItem(CHEST_ITEM, TILE) },
        { position: decoy, item: seededMapItem(CHEST_ITEM, decoy) },
      ],
      chests: chestAt(TILE),
    });
    const { session } = await harness.makeSession("actor", { x: 3, y: 5, z: 7 });

    expect(harness.worldActions.handleChestUse(session, decoy, 1_000)).toBe(
      false,
    );
    expect(harness.lootedChests).toEqual([]);
  });

  it("rejects a chest whose registered item type is not on the tile", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(LEVER_OFF, TILE) }],
      chests: chestAt(TILE),
    });
    const { session } = await harness.makeSession("actor", { x: 5, y: 5, z: 7 });

    expect(harness.worldActions.handleChestUse(session, TILE, 1_000)).toBe(
      false,
    );
    expect(harness.lootedChests).toEqual([]);
  });

  it("rejects chest use from beyond reach", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(CHEST_ITEM, TILE) }],
      chests: chestAt(TILE),
    });
    const { session, sent } = await harness.makeSession("far", {
      x: 1,
      y: 1,
      z: 7,
    });

    expect(harness.worldActions.handleChestUse(session, TILE, 1_000)).toBe(true);
    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(harness.lootedChests).toEqual([]);
  });

  it("answers out-of-view chest probes exactly like empty tiles", async () => {
    const farTile = { x: 25, y: 4, z: 7 };
    const harness = makeHarness({
      items: [{ position: farTile, item: seededMapItem(CHEST_ITEM, farTile) }],
      chests: chestAt(farTile),
      width: 30,
    });
    const { session, sent } = await harness.makeSession("prober", {
      x: 1,
      y: 1,
      z: 7,
    });

    expect(harness.worldActions.handleChestUse(session, farTile, 1_000)).toBe(
      false,
    );
    expect(sent).toHaveLength(0);
    expect(harness.lootedChests).toEqual([]);
  });

  it("leaves non-chest tiles to the paths behind the chest-only pass", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(CLOSED_DOOR, TILE) }],
      chests: chestAt({ x: 1, y: 1, z: 7 }),
    });
    const { session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });

    expect(harness.worldActions.handleChestUse(session, TILE, 1_000)).toBe(
      false,
    );
    expect(sent).toHaveLength(0);
    expect(tileItemIds(harness, TILE)).toEqual([CLOSED_DOOR]);
  });
});

describe("WorldActionRegistry write-map", () => {
  const writeIntent = (
    itemId: string,
    revision: number,
    position: Position,
    text: string,
  ) =>
    ({
      type: "write-map-item",
      itemId,
      revision,
      position,
      text,
    }) as const;

  const boardHarness = () =>
    makeHarness({
      items: [
        {
          position: TILE,
          item: seededMapItem(DISTANCE_BLACKBOARD, TILE, { text: "old" }),
        },
      ],
    });

  it("writes text onto a pristine board as one materialized row", async () => {
    const harness = boardHarness();
    const { session } = await harness.makeSession("scribe", {
      x: 5,
      y: 5,
      z: 7,
    });

    harness.worldActions.handleWriteMap(
      session,
      writeIntent(`test:${TILE.x}:${TILE.y}:${TILE.z}:1`, 1, TILE, "chalked"),
      1_000,
    );

    await harness.items.stopPersists();
    const rows = harness.store.allItems();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: 2 });
    expect(rows[0]?.attributes).toMatchObject({ text: "chalked" });
  });

  it("leaves one coherent text when two writers race the same board", async () => {
    const harness = boardHarness();
    const first = await harness.makeSession("first", { x: 5, y: 5, z: 7 });
    const second = await harness.makeSession("second", { x: 4, y: 4, z: 7 });
    const instanceId = `test:${TILE.x}:${TILE.y}:${TILE.z}:1`;

    harness.worldActions.handleWriteMap(
      first.session,
      writeIntent(instanceId, 1, TILE, "first"),
      1_000,
    );
    // The loser still claims revision 1, which no longer exists.
    harness.worldActions.handleWriteMap(
      second.session,
      writeIntent(instanceId, 1, TILE, "second"),
      1_000,
    );

    await harness.items.stopPersists();
    const rows = harness.store.allItems();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attributes).toMatchObject({ text: "first" });
    expect(second.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
  });

  it("rejects text longer than the item type allows", async () => {
    const harness = boardHarness();
    const { session, sent } = await harness.makeSession("scribe", {
      x: 5,
      y: 5,
      z: 7,
    });

    harness.worldActions.handleWriteMap(
      session,
      writeIntent(
        `test:${TILE.x}:${TILE.y}:${TILE.z}:1`,
        1,
        TILE,
        "x".repeat(1_024),
      ),
      1_000,
    );

    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    await harness.items.stopPersists();
    expect(harness.store.allItems()).toHaveLength(0);
  });

  it("rejects a write beyond reach even on a distance-readable board", async () => {
    const harness = boardHarness();
    const { session, sent } = await harness.makeSession("far", {
      x: 1,
      y: 1,
      z: 7,
    });

    harness.worldActions.handleWriteMap(
      session,
      writeIntent(`test:${TILE.x}:${TILE.y}:${TILE.z}:1`, 1, TILE, "remote"),
      1_000,
    );

    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    await harness.items.stopPersists();
    expect(harness.store.allItems()).toHaveLength(0);
  });

  it("rejects a forged instance id for the targeted tile", async () => {
    const harness = boardHarness();
    const { session, sent } = await harness.makeSession("forger", {
      x: 5,
      y: 5,
      z: 7,
    });

    harness.worldActions.handleWriteMap(
      session,
      writeIntent("test:9:9:9:1", 1, TILE, "forged"),
      1_000,
    );

    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    await harness.items.stopPersists();
    expect(harness.store.allItems()).toHaveLength(0);
  });

  it("rejects a write onto a read-only map item", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(LEVER_OFF, TILE) }],
    });
    const { session, sent } = await harness.makeSession("scribe", {
      x: 5,
      y: 5,
      z: 7,
    });

    harness.worldActions.handleWriteMap(
      session,
      writeIntent(`test:${TILE.x}:${TILE.y}:${TILE.z}:1`, 1, TILE, "nope"),
      1_000,
    );

    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
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

describe("WorldActionRegistry decoration kits", () => {
  const DECORATION_KIT = 23_398;
  const DEMON_EXERCISE_DUMMY = 28_561;

  it("unwraps a kit into its furniture for someone who may redecorate", async () => {
    const harness = makeHarness({
      items: [
        {
          position: TILE,
          item: seededMapItem(DECORATION_KIT, TILE, {
            unwrapTo: DEMON_EXERCISE_DUMMY,
          }),
        },
      ],
      decorateAccess: () => true,
    });
    const { session } = await harness.makeSession("owner", { x: 5, y: 5, z: 7 });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(tileItemIds(harness, TILE)).toEqual([DEMON_EXERCISE_DUMMY]);
    await harness.items.stopPersists();
    // The kit's routing attributes are gone with the kit.
    expect(harness.store.allItems()[0]).toMatchObject({
      typeId: DEMON_EXERCISE_DUMMY,
      attributes: {},
    });
  });

  it("refuses a guest and anyone outside a house they may redecorate", async () => {
    const harness = makeHarness({
      items: [
        {
          position: TILE,
          item: seededMapItem(DECORATION_KIT, TILE, {
            unwrapTo: DEMON_EXERCISE_DUMMY,
          }),
        },
      ],
      decorateAccess: () => false,
    });
    const { session, sent } = await harness.makeSession("guest", {
      x: 5,
      y: 5,
      z: 7,
    });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(sent.at(-1)).toMatchObject({
      type: "combat-log",
      text: "Unwrap it in a house you own.",
    });
    expect(tileItemIds(harness, TILE)).toEqual([DECORATION_KIT]);
  });

  it("fails closed when no house service is wired at all", async () => {
    const harness = makeHarness({
      items: [
        {
          position: TILE,
          item: seededMapItem(DECORATION_KIT, TILE, {
            unwrapTo: DEMON_EXERCISE_DUMMY,
          }),
        },
      ],
    });
    const { session } = await harness.makeSession("actor", { x: 5, y: 5, z: 7 });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(tileItemIds(harness, TILE)).toEqual([DECORATION_KIT]);
  });

  it("treats a kit without a furniture target as unsupported", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(DECORATION_KIT, TILE) }],
      decorateAccess: () => true,
    });
    const { session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(tileItemIds(harness, TILE)).toEqual([DECORATION_KIT]);
  });
});

describe("WorldActionRegistry ground food", () => {
  const MEAT = 3_577;

  it("eats one unit off an adjacent ground stack and persists the shrunk row", async () => {
    const harness = makeHarness({
      items: [
        { position: TILE, item: seededMapItem(MEAT, TILE, { count: 3 }) },
      ],
    });
    const { session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(sent.at(-1)).toMatchObject({
      type: "combat-log",
      kind: "condition",
      text: "Munch.",
    });
    const [stack] = harness.world.getMapItems(TILE);
    expect(stack).toMatchObject({ itemId: MEAT, count: 2 });

    await harness.items.stopPersists();
    const rows = harness.store.allItems();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ typeId: MEAT, count: 2 });
    expect(sent.filter((message) => message.type === "error")).toHaveLength(0);
  });

  it("removes the item from the tile when the last unit is eaten", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(MEAT, TILE) }],
    });
    const { session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(tileItemIds(harness, TILE)).toEqual([]);
    expect(sent.at(-1)).toMatchObject({ type: "combat-log", text: "Munch." });

    // A pristine seed eaten whole never had a row, so nothing persists.
    await harness.items.stopPersists();
    expect(harness.store.allItems()).toHaveLength(0);

    // The seed stays hidden for this uptime: a second use finds nothing.
    expect(harness.worldActions.handleUseMap(session, TILE, 2_000)).toBe(false);
  });

  it("refuses to eat when the player is full and leaves the stack intact", async () => {
    const harness = makeHarness({
      items: [
        { position: TILE, item: seededMapItem(MEAT, TILE, { count: 3 }) },
      ],
    });
    const { player, session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });
    player.feed(1_150, 500);
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(sent.at(-1)).toMatchObject({ type: "error", code: "player-full" });
    // The seed was never touched: still pristine, nothing persisted.
    expect(tileItemIds(harness, TILE)).toEqual([MEAT]);
    await harness.items.stopPersists();
    expect(harness.store.allItems()).toHaveLength(0);
  });

  it("rejects eating food that is out of reach", async () => {
    const harness = makeHarness({
      items: [
        { position: TILE, item: seededMapItem(MEAT, TILE, { count: 3 }) },
      ],
    });
    const { session, sent } = await harness.makeSession("actor", {
      x: 2,
      y: 4,
      z: 7,
    });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(tileItemIds(harness, TILE)).toEqual([MEAT]);
    await harness.items.stopPersists();
    expect(harness.store.allItems()).toHaveLength(0);
  });
});

describe("WorldActionRegistry harvest", () => {
  const FULL_BUSH = 3_699;
  const PICKED_BUSH = 3_700;
  const BLUEBERRY = 3_588;

  it("picks a blueberry bush: fruit drops on the tile, bush depletes, one atomic plan", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(FULL_BUSH, TILE) }],
    });
    const { session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(sent.filter((message) => message.type === "error")).toHaveLength(0);

    const tile = harness.world.getMapItems(TILE);
    expect(tile.map((item) => item.itemId).sort()).toEqual([
      BLUEBERRY,
      PICKED_BUSH,
    ]);
    expect(tile.find((item) => item.itemId === BLUEBERRY)).toMatchObject({
      count: 3,
    });

    await harness.items.stopPersists();
    const rows = harness.store.allItems();
    expect(rows.map((row) => row.typeId).sort()).toEqual([
      BLUEBERRY,
      PICKED_BUSH,
    ]);
  });

  it("does nothing on an already picked bush", async () => {
    const harness = makeHarness({
      items: [{ position: TILE, item: seededMapItem(PICKED_BUSH, TILE) }],
    });
    const { session } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });
    // No harvest registered for the depleted type: falls through to movement.
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(false);
    expect(tileItemIds(harness, TILE)).toEqual([PICKED_BUSH]);
  });

  it("fails closed on a scripted bush placement", async () => {
    const harness = makeHarness({
      items: [
        {
          position: TILE,
          item: seededMapItem(FULL_BUSH, TILE, { actionId: 1_234 }),
        },
      ],
    });
    const { session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });
    expect(harness.worldActions.handleUseMap(session, TILE, 1_000)).toBe(true);
    expect(sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(tileItemIds(harness, TILE)).toEqual([FULL_BUSH]);
  });
});
