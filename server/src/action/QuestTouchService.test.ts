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
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { QuestTouchService } from "./QuestTouchService";
import {
  QUEST_TOUCH_ACTIONS,
  type QuestTouchDefinition,
} from "./questTouchTables";
import { QUEST_TOUCH_WALL_TILES } from "./questTouchWallTiles";
import { WorldActionRegistry } from "./WorldActionRegistry";

const STONE_WALL = 1_295;
const POFF = 3;
// The touch tile is baked scenery: no world item exists there at all.
const TOUCH = { x: 5, y: 4, z: 7 } as const;
const WALL = { x: 3, y: 6, z: 7 } as const;
const GRINDING =
  "You hear a loud grinding sound not very far from you. something very heavy seems to have moved.";

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function seededWall(): MapItem {
  const instanceId = `test:${WALL.x}:${WALL.y}:${WALL.z}:1`;
  return {
    instanceId,
    itemId: STONE_WALL,
    stackIndex: 1,
    mutable: true,
    source: {
      seedKey: instanceId,
      mapName: "test",
      mapVersion: "v1",
      typeId: STONE_WALL,
      attributes: {},
      position: { ...WALL },
      stackIndex: 1,
      contents: [],
    },
  };
}

function makeHarness(options: { wallPlaced?: boolean } = {}) {
  const touch: QuestTouchDefinition = {
    itemId: 2_930,
    removals: [{ position: WALL, itemId: STONE_WALL }],
    message: GRINDING,
    effectId: POFF,
    cooldownSeconds: 306,
    restoreAfterMs: 300_000,
  };
  const world = new World(
    gridMapData({
      name: "test",
      width: 10,
      height: 8,
      blocked: [[WALL.x, WALL.y]],
      items:
        options.wallPlaced === false
          ? []
          : [{ position: WALL, item: seededWall() }],
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
  const effects: Array<{ position: Position; effectId: number }> = [];
  const service = new QuestTouchService(world, items, (position, effectId) => {
    effects.push({ position: { ...position }, effectId });
  });
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
    new Map([[positionKey(TOUCH), touch]]),
    (session, player, position, definition, now) =>
      service.use(session, player, position, definition, now),
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
  return { world, items, service, worldActions, effects, makeSession };
}

const wallItemIds = (harness: { world: World }) =>
  harness.world.getMapItems(WALL).map((item) => item.itemId);

const combatLogs = (sent: ServerMessage[]) =>
  sent.filter((message) => message.type === "combat-log");

describe("QuestTouchService", () => {
  it("removes the wall, says the grinding line, and puffs at the wall", async () => {
    const harness = makeHarness();
    const { session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });

    expect(harness.worldActions.handleUseMap(session, TOUCH, 1_000)).toBe(true);
    expect(wallItemIds(harness)).toEqual([]);
    expect(sent.at(-1)).toMatchObject({
      type: "combat-log",
      kind: "condition",
      text: GRINDING,
    });
    expect(harness.effects).toEqual([{ position: WALL, effectId: POFF }]);
  });

  it("only puffs at the player while the world-shared cooldown runs", async () => {
    const harness = makeHarness();
    const first = await harness.makeSession("first", { x: 5, y: 5, z: 7 });
    expect(
      harness.worldActions.handleUseMap(first.session, TOUCH, 1_000),
    ).toBe(true);

    // The cooldown is global, so a different character is refused too.
    const second = await harness.makeSession("second", { x: 4, y: 4, z: 7 });
    expect(
      harness.worldActions.handleUseMap(second.session, TOUCH, 2_000),
    ).toBe(true);
    expect(combatLogs(second.sent)).toEqual([]);
    expect(harness.effects.at(-1)).toEqual({
      position: { x: 4, y: 4, z: 7 },
      effectId: POFF,
    });

    // Still gone: the second use never re-removed or restored anything.
    expect(wallItemIds(harness)).toEqual([]);
  });

  it("consumes the use silently when the wall is gone and no cooldown runs", async () => {
    const harness = makeHarness({ wallPlaced: false });
    const { session, sent } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });

    // Canary falls through returning true: consumed, nothing visible at all.
    expect(harness.worldActions.handleUseMap(session, TOUCH, 1_000)).toBe(true);
    expect(combatLogs(sent)).toEqual([]);
    expect(harness.effects).toEqual([]);
  });

  it("restores the wall from the tick drain after restoreAfterMs", async () => {
    const harness = makeHarness();
    const { session } = await harness.makeSession("actor", {
      x: 5,
      y: 5,
      z: 7,
    });
    expect(harness.worldActions.handleUseMap(session, TOUCH, 1_000)).toBe(true);
    expect(wallItemIds(harness)).toEqual([]);

    harness.service.applyResolvedOutcomes(1_000 + 299_999);
    expect(wallItemIds(harness)).toEqual([]);

    harness.service.applyResolvedOutcomes(1_000 + 300_000);
    expect(wallItemIds(harness)).toEqual([STONE_WALL]);

    // Cooldown expired and the wall is back: the touch works again.
    expect(
      harness.worldActions.handleUseMap(session, TOUCH, 1_000 + 306_001),
    ).toBe(true);
    expect(wallItemIds(harness)).toEqual([]);
  });

  it("rejects a touch from beyond reach and answers out-of-view like empty", async () => {
    const harness = makeHarness();
    const far = await harness.makeSession("far", { x: 1, y: 1, z: 7 });
    expect(harness.worldActions.handleUseMap(far.session, TOUCH, 1_000)).toBe(
      true,
    );
    expect(far.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
    expect(wallItemIds(harness)).toEqual([STONE_WALL]);
  });

  it("ships the Cults of Tibia torch entry and derives its wall tile", () => {
    const torch = QUEST_TOUCH_ACTIONS.get(
      positionKey({ x: 32_400, y: 31_793, z: 8 }),
    );
    expect(torch).toMatchObject({
      itemId: 2_930,
      message: GRINDING,
      effectId: POFF,
      cooldownSeconds: 306,
      restoreAfterMs: 300_000,
    });
    expect(torch?.removals).toEqual([
      { position: { x: 32_396, y: 31_806, z: 8 }, itemId: STONE_WALL },
    ]);
    expect(
      QUEST_TOUCH_WALL_TILES.get(positionKey({ x: 32_396, y: 31_806, z: 8 })),
    ).toBe(STONE_WALL);
  });
});
