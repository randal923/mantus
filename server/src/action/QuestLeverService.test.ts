import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Position, ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import { gridMapData } from "../gridMapData";
import type { ItemCatalog } from "../item/ItemCatalog";
import { ItemIntentHandler } from "../item/ItemIntentHandler";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { MemoryItemStore } from "../item/MemoryItemStore";
import type { MapItem } from "../MapItem";
import { Player } from "../Player";
import { positionKey } from "../positionKey";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { QuestLeverService } from "./QuestLeverService";
import {
  QUEST_LEVER_TRIGGERS,
  type QuestLeverDefinition,
  type QuestLeverTrigger,
} from "./questLeverTables";
import { QUEST_TILE_PASSABILITY } from "./questTilePassability";
import { WorldActionRegistry } from "./WorldActionRegistry";

const LEVER_OFF = 2_772;
const LEVER_ON = 2_773;
const STONE = 1_791;
const DOOR_CLOSED = 5_107;
const DOOR_OPEN = 5_108;
const BRIDGE = 5_770;
const RAIL_WEST = 4_634;

const LEVER_A = { x: 5, y: 3, z: 7 } as const;
const LEVER_B = { x: 8, y: 3, z: 7 } as const;
const STONE_TILE = { x: 3, y: 5, z: 7 } as const;
const RELOCATE = { x: 3, y: 6, z: 7 } as const;
const MONSTERS_TO = { x: 4, y: 6, z: 7 } as const;

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function seeded(position: Position, itemId: number, stackIndex = 1): MapItem {
  const instanceId = `test:${position.x}:${position.y}:${position.z}:${stackIndex}`;
  return {
    instanceId,
    itemId,
    stackIndex,
    mutable: true,
    source: {
      seedKey: instanceId,
      mapName: "test",
      mapVersion: "v1",
      typeId: itemId,
      attributes: {},
      position: { ...position },
      stackIndex,
      contents: [],
    },
  };
}

function makeHarness(
  definition: QuestLeverDefinition,
  seededItems: Array<{ position: Position; item: MapItem }>,
  extraTriggers: Array<readonly [Position, QuestLeverTrigger]> = [],
) {
  const world = new World(
    gridMapData({
      name: "test",
      width: 10,
      height: 8,
      blocked: [],
      items: seededItems,
    }),
    25,
    undefined,
    (itemId) => catalog.get(itemId)?.weight,
  );
  const registry = new SessionRegistry();
  const store = new MemoryItemStore();
  const items = new ItemIntentHandler(
    store,
    catalog,
    world,
    new Visibility(world, registry),
  );
  const relocatedPlayers: Array<{ id: string; to: Position }> = [];
  const relocatedMonsters: Array<{ id: string; to: Position }> = [];
  const service = new QuestLeverService(world, catalog, items, {
    relocatePlayer: (player, to) => {
      relocatedPlayers.push({ id: player.id, to: { ...to } });
      world.relocateCreature(player, to);
    },
    relocateMonster: (creature, to) => {
      relocatedMonsters.push({ id: creature.id, to: { ...to } });
      world.relocateCreature(creature, to);
    },
  });
  const triggers = new Map<string, QuestLeverTrigger>();
  for (const position of definition.leverPositions) {
    triggers.set(positionKey(position), { definition, role: "lever" });
  }
  for (const [position, trigger] of extraTriggers) {
    triggers.set(positionKey(position), trigger);
  }
  const worldActions = new WorldActionRegistry(
    world,
    catalog,
    items,
    new Map(),
    undefined,
    new Map(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    new Map(),
    undefined,
    triggers,
    (session, player, position, trigger, now) =>
      service.use(session, player, position, trigger, now),
  );
  const makeSession = async (characterId: string, position: Position) => {
    const player = new Player(makeCharacter(characterId), position);
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
  const itemIdsAt = (position: Position) =>
    world.getMapItems(position).map((item) => item.itemId);
  return {
    world,
    items,
    service,
    worldActions,
    makeSession,
    itemIdsAt,
    relocatedPlayers,
    relocatedMonsters,
  };
}

const bearDefinition = (): QuestLeverDefinition => ({
  id: "test-bear-room",
  leverOffId: LEVER_OFF,
  leverOnId: LEVER_ON,
  leverPositions: [LEVER_A],
  pull: {
    operations: [{ kind: "remove", position: STONE_TILE, itemId: STONE }],
    requiresPrimaryTarget: true,
  },
  reset: {
    operations: [{ kind: "create", position: STONE_TILE, itemId: STONE }],
    relocations: [{ from: STONE_TILE, to: RELOCATE }],
  },
});

describe("QuestLeverService", () => {
  it("pull removes the stone and flips the lever; reset recreates it", async () => {
    const harness = makeHarness(bearDefinition(), [
      { position: LEVER_A, item: seeded(LEVER_A, LEVER_OFF) },
      { position: STONE_TILE, item: seeded(STONE_TILE, STONE) },
    ]);
    const { session } = await harness.makeSession("actor", { x: 5, y: 4, z: 7 });

    expect(harness.worldActions.handleUseMap(session, LEVER_A, 1_000)).toBe(true);
    expect(harness.itemIdsAt(STONE_TILE)).toEqual([]);
    expect(harness.itemIdsAt(LEVER_A)).toEqual([LEVER_ON]);

    expect(harness.worldActions.handleUseMap(session, LEVER_A, 2_000)).toBe(true);
    expect(harness.itemIdsAt(STONE_TILE)).toEqual([STONE]);
    expect(harness.itemIdsAt(LEVER_A)).toEqual([LEVER_OFF]);
  });

  it("pull with the stone already gone leaves the lever unflipped, silently", async () => {
    const harness = makeHarness(bearDefinition(), [
      { position: LEVER_A, item: seeded(LEVER_A, LEVER_OFF) },
    ]);
    const { session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 4,
      z: 7,
    });

    expect(harness.worldActions.handleUseMap(session, LEVER_A, 1_000)).toBe(true);
    expect(harness.itemIdsAt(LEVER_A)).toEqual([LEVER_OFF]);
    expect(
      sent.filter((message) => message.type === "combat-log"),
    ).toEqual([]);
  });

  it("reset relocates a player standing on the stone tile before recreating", async () => {
    const harness = makeHarness(bearDefinition(), [
      { position: LEVER_A, item: seeded(LEVER_A, LEVER_ON) },
    ]);
    const { session } = await harness.makeSession("actor", { x: 5, y: 4, z: 7 });
    const bystander = await harness.makeSession("bystander", STONE_TILE);

    expect(harness.worldActions.handleUseMap(session, LEVER_A, 1_000)).toBe(true);
    expect(harness.relocatedPlayers).toEqual([
      { id: bystander.player.id, to: RELOCATE },
    ]);
    expect(harness.itemIdsAt(STONE_TILE)).toEqual([STONE]);
    expect(harness.itemIdsAt(LEVER_A)).toEqual([LEVER_OFF]);
  });

  it("katana shape: lever opens/closes the door, door-use forces the close", async () => {
    const DOOR_TILE = { x: 6, y: 5, z: 7 } as const;
    const DOORWAY_OUT = { x: 7, y: 5, z: 7 } as const;
    const definition: QuestLeverDefinition = {
      id: "test-katana",
      leverOffId: LEVER_OFF,
      leverOnId: LEVER_ON,
      leverPositions: [LEVER_A],
      pull: {
        operations: [
          {
            kind: "transform",
            position: DOOR_TILE,
            fromItemId: DOOR_CLOSED,
            toItemId: DOOR_OPEN,
          },
        ],
        requiresPrimaryTarget: true,
      },
      reset: {
        operations: [
          {
            kind: "transform",
            position: DOOR_TILE,
            fromItemId: DOOR_OPEN,
            toItemId: DOOR_CLOSED,
          },
        ],
        requiresPrimaryTarget: true,
        relocations: [{ from: DOOR_TILE, to: DOORWAY_OUT }],
      },
    };
    const harness = makeHarness(
      definition,
      [
        { position: LEVER_A, item: seeded(LEVER_A, LEVER_OFF) },
        { position: DOOR_TILE, item: seeded(DOOR_TILE, DOOR_CLOSED) },
      ],
      [[DOOR_TILE, { definition, role: "reset" }]],
    );
    const { session } = await harness.makeSession("actor", { x: 5, y: 4, z: 7 });

    // Pull: the door opens.
    expect(harness.worldActions.handleUseMap(session, LEVER_A, 1_000)).toBe(true);
    expect(harness.itemIdsAt(DOOR_TILE)).toEqual([DOOR_OPEN]);
    expect(harness.itemIdsAt(LEVER_A)).toEqual([LEVER_ON]);

    // Using the open door forces it closed and re-arms the lever, without
    // relocating anyone (Canary's katana_quest_door).
    const doorSession = await harness.makeSession("doorUser", {
      x: 6,
      y: 4,
      z: 7,
    });
    expect(
      harness.worldActions.handleUseMap(doorSession.session, DOOR_TILE, 2_000),
    ).toBe(true);
    expect(harness.itemIdsAt(DOOR_TILE)).toEqual([DOOR_CLOSED]);
    expect(harness.itemIdsAt(LEVER_A)).toEqual([LEVER_OFF]);
    expect(harness.relocatedPlayers).toEqual([]);

    // Reset via lever relocates whoever stands in the doorway.
    expect(harness.worldActions.handleUseMap(session, LEVER_A, 3_000)).toBe(true);
    expect(harness.itemIdsAt(DOOR_TILE)).toEqual([DOOR_OPEN]);
    const blocker = await harness.makeSession("blocker", DOOR_TILE);
    expect(harness.worldActions.handleUseMap(session, LEVER_A, 4_000)).toBe(true);
    expect(harness.relocatedPlayers).toEqual([
      { id: blocker.player.id, to: DOORWAY_OUT },
    ]);
    expect(harness.itemIdsAt(DOOR_TILE)).toEqual([DOOR_CLOSED]);
  });

  it("sewer shape: both levers flip together and monsters split off", async () => {
    const SPAN: Position = { x: 6, y: 6, z: 7 };
    const SPAN_EAST: Position = { x: 7, y: 6, z: 7 };
    const definition: QuestLeverDefinition = {
      id: "test-sewer",
      leverOffId: LEVER_OFF,
      leverOnId: LEVER_ON,
      leverPositions: [LEVER_A, LEVER_B],
      pull: {
        operations: [
          { kind: "create", position: SPAN, itemId: BRIDGE },
          { kind: "remove", position: SPAN, itemId: RAIL_WEST },
        ],
      },
      reset: {
        operations: [
          { kind: "remove", position: SPAN, itemId: BRIDGE },
          { kind: "create", position: SPAN, itemId: RAIL_WEST },
        ],
        relocations: [
          { from: SPAN, to: RELOCATE, monstersTo: MONSTERS_TO },
          { from: SPAN_EAST, to: RELOCATE, monstersTo: MONSTERS_TO },
        ],
      },
    };
    const harness = makeHarness(definition, [
      { position: LEVER_A, item: seeded(LEVER_A, LEVER_OFF) },
      { position: LEVER_B, item: seeded(LEVER_B, LEVER_OFF) },
      { position: SPAN, item: seeded(SPAN, RAIL_WEST) },
    ]);
    const { session } = await harness.makeSession("actor", { x: 5, y: 4, z: 7 });

    expect(harness.worldActions.handleUseMap(session, LEVER_A, 1_000)).toBe(true);
    expect(harness.itemIdsAt(SPAN)).toEqual([BRIDGE]);
    expect(harness.itemIdsAt(LEVER_A)).toEqual([LEVER_ON]);
    expect(harness.itemIdsAt(LEVER_B)).toEqual([LEVER_ON]);

    // Pulling the OTHER lever retracts; players and monsters split.
    const walker = await harness.makeSession("walker", SPAN);
    // The world only needs position/kind for relocation; the behaviour
    // fields of a real monster type never run in this test.
    const monster = new Monster({
      id: "rat",
      type: { name: "rat", speed: 200 } as unknown as MonsterType,
      position: { ...SPAN_EAST },
      direction: "south",
      home: { ...SPAN_EAST },
      spawnRadius: 2,
    });
    harness.world.addCreature(monster);
    const actorB = await harness.makeSession("actorB", { x: 8, y: 4, z: 7 });
    expect(
      harness.worldActions.handleUseMap(actorB.session, LEVER_B, 2_000),
    ).toBe(true);
    expect(harness.itemIdsAt(SPAN)).toEqual([RAIL_WEST]);
    expect(harness.itemIdsAt(LEVER_A)).toEqual([LEVER_OFF]);
    expect(harness.itemIdsAt(LEVER_B)).toEqual([LEVER_OFF]);
    expect(harness.relocatedPlayers).toEqual([
      { id: walker.player.id, to: RELOCATE },
    ]);
    expect(harness.relocatedMonsters).toEqual([
      { id: "rat", to: MONSTERS_TO },
    ]);
  });

  it("ships the Rookgaard triggers and their passability rules", () => {
    // Bear room lever + katana lever/door + both sewer levers.
    for (const position of [
      { x: 32_148, y: 32_105, z: 11 },
      { x: 32_182, y: 32_145, z: 11 },
      { x: 32_177, y: 32_148, z: 11 },
      { x: 32_098, y: 32_204, z: 8 },
      { x: 32_104, y: 32_204, z: 8 },
    ]) {
      expect(QUEST_LEVER_TRIGGERS.get(positionKey(position))).toBeDefined();
    }
    expect(
      QUEST_LEVER_TRIGGERS.get(positionKey({ x: 32_177, y: 32_148, z: 11 }))
        ?.role,
    ).toBe("reset");
    expect(
      QUEST_TILE_PASSABILITY.get(positionKey({ x: 32_145, y: 32_101, z: 11 })),
    ).toEqual({ blockingItemIds: [STONE], blocksProjectileWhenBlocked: true });
    expect(
      QUEST_TILE_PASSABILITY.get(positionKey({ x: 32_100, y: 32_205, z: 8 })),
    ).toEqual({
      requiredItemId: BRIDGE,
      blocksProjectileWhenBlocked: false,
      groundSpeedWhenWalkable: 90,
    });
  });
});
