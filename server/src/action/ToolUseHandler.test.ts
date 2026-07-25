import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Position, ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { gridMapData } from "../gridMapData";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { ItemIntentHandler } from "../item/ItemIntentHandler";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { MemoryItemStore } from "../item/MemoryItemStore";
import type { MapItem } from "../MapItem";
import { MovementHandler } from "../MovementHandler";
import { Player } from "../Player";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { ToolUseHandler } from "./ToolUseHandler";
import { WorldActionRng } from "./WorldActionRng";

const ROPE = 3_003;
const SHOVEL = 3_457;
const MACHETE = 3_308;
const SCYTHE = 3_453;
const PICK = 3_456;
const CROWBAR = 3_304;
const FISHING_ROD = 3_483;
const WORM = 3_492;
const APPLE = 3_585;
const STONE_PILE = 593;
const OPEN_HOLE = 594;
const JUNGLE_GRASS = 3_696;
const CUT_JUNGLE_GRASS = 3_695;
const WHEAT = 3_653;
const CUT_WHEAT = 3_651;
const BUNCH_OF_WHEAT = 3_605;
const CRUSHABLE_STONE = 20_135;
const FINE_GRAVEL = 20_133;
const CRUSHED_STONE = 20_134;
const WATER = 4_597;
const ROPE_SPOT = { x: 5, y: 4, z: 7 } as const;
const ROPE_DESTINATION = { x: 5, y: 5, z: 6 } as const;
const PILE = { x: 4, y: 4, z: 7 } as const;
const BELOW_PILE = { x: 4, y: 4, z: 8 } as const;
const BACKPACK_ID = "00000000-0000-4000-8000-000000000099";

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function carriedItem(id: string, typeId: number, characterId: string): Item {
  return {
    id,
    typeId,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
  };
}

function seededPile(itemId: number) {
  const instanceId = `test:${PILE.x}:${PILE.y}:${PILE.z}:1`;
  return {
    position: { ...PILE },
    item: {
      instanceId,
      itemId,
      stackIndex: 1,
      mutable: true,
      source: {
        seedKey: instanceId,
        mapName: "test",
        mapVersion: "v1",
        typeId: itemId,
        attributes: {},
        position: { ...PILE },
        stackIndex: 1,
        contents: [],
      },
    },
  };
}

function seededAt(
  itemId: number,
  position: Position,
): { position: Position; item: MapItem } {
  const instanceId = `test:${position.x}:${position.y}:${position.z}:1`;
  return {
    position: { ...position },
    item: {
      instanceId,
      itemId,
      stackIndex: 1,
      mutable: true,
      source: {
        seedKey: instanceId,
        mapName: "test",
        mapVersion: "v1",
        typeId: itemId,
        attributes: {},
        position: { ...position },
        stackIndex: 1,
        contents: [],
      },
    },
  };
}

async function makeHarness(
  inventory: ReadonlyArray<Item>,
  options: {
    pile?: boolean;
    items?: ReadonlyArray<{ position: Position; item: MapItem }>;
    seed?: number;
  } = {},
) {
  const world = new World(
    gridMapData({
      name: "rope-test",
      width: 10,
      height: 8,
      blocked: [],
      floors: [6, 7, 8],
      groundSpeed: 50,
      actions: [
        {
          kind: "rope-spot",
          activation: "use-with",
          source: ROPE_SPOT,
          destination: ROPE_DESTINATION,
          itemId: 386,
        },
      ],
      items: options.pile
        ? [seededPile(STONE_PILE)]
        : [...(options.items ?? [])],
    }),
    25,
  );
  const registry = new SessionRegistry();
  const visibility = new Visibility(world, registry);
  const store = new MemoryItemStore(catalog);
  store.seed({
    id: BACKPACK_ID,
    typeId: 2854,
    count: 1,
    attributes: {},
    version: 1,
    location: {
      kind: "equipment",
      characterId: "actor",
      slot: "backpack",
    },
  });
  for (const item of inventory) store.seed(item);
  const items = new ItemIntentHandler(store, catalog, world, visibility);
  const persistence = {
    markDirty: vi.fn(),
    saveNow: vi.fn(),
    beginExternalMutation: vi.fn(() => Promise.resolve(1)),
    completeExternalMutation: vi.fn(),
    cancelExternalMutation: vi.fn(),
  } as unknown as CharacterPersistence;
  const movement = new MovementHandler(world, visibility, persistence);
  const spawned: Array<{ typeName: string; position: Position }> = [];
  const progression = {
    awardSkillTries: vi.fn(),
    syncPlayer: vi.fn(),
  } as unknown as ProgressionSystem;
  const toolUse = new ToolUseHandler(
    world,
    catalog,
    items,
    movement,
    visibility,
    persistence,
    progression,
    new WorldActionRng(options.seed ?? 1_234),
    (typeName, position) => {
      spawned.push({ typeName, position: { ...position } });
    },
  );

  const player = new Player(makeCharacter("actor", "Roper"), {
    x: 5,
    y: 5,
    z: 7,
  });
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
  const session = new Session("actor", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = "actor";
  registry.add(session);
  items.attach(await items.load("actor", 400));
  return { world, items, player, session, sent, toolUse, progression, spawned };
}

const useWith = (itemId: string, revision: number, targetPosition: Position) =>
  ({
    type: "use-item-with",
    itemId,
    revision,
    targetPosition,
  }) as const;

describe("ToolUseHandler", () => {
  it("teleports the player up when a carried rope is used on a rope spot", async () => {
    const { player, session, toolUse } = await makeHarness([
      carriedItem("11111111-1111-4111-8111-111111111111", ROPE, "actor"),
    ]);

    const consumed = toolUse.handle(
      session,
      useWith("11111111-1111-4111-8111-111111111111", 1, ROPE_SPOT),
      1000,
    );

    expect(consumed).toBe(true);
    expect(player.position).toEqual(ROPE_DESTINATION);
  });

  it("falls through on a stale item revision instead of acting", async () => {
    const { player, session, toolUse } = await makeHarness([
      carriedItem("11111111-1111-4111-8111-111111111111", ROPE, "actor"),
    ]);

    const consumed = toolUse.handle(
      session,
      useWith("11111111-1111-4111-8111-111111111111", 7, ROPE_SPOT),
      1000,
    );

    expect(consumed).toBe(false);
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
  });

  it("falls through for carried items that are not tools", async () => {
    const { player, session, toolUse } = await makeHarness([
      carriedItem("22222222-2222-4222-8222-222222222222", APPLE, "actor"),
    ]);

    const consumed = toolUse.handle(
      session,
      useWith("22222222-2222-4222-8222-222222222222", 1, ROPE_SPOT),
      1000,
    );

    expect(consumed).toBe(false);
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
  });

  it("corrects the client when the rope targets a plain tile", async () => {
    const { player, session, sent, toolUse } = await makeHarness([
      carriedItem("11111111-1111-4111-8111-111111111111", ROPE, "actor"),
    ]);

    const consumed = toolUse.handle(
      session,
      useWith("11111111-1111-4111-8111-111111111111", 1, { x: 4, y: 5, z: 7 }),
      1000,
    );

    expect(consumed).toBe(true);
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
    expect(sent.some((message) => message.type === "position-correction")).toBe(
      true,
    );
  });

  it("does not move the player toward a rope spot beyond reach", async () => {
    const { player, session, toolUse } = await makeHarness([
      carriedItem("11111111-1111-4111-8111-111111111111", ROPE, "actor"),
    ]);
    player.moveTo({ x: 2, y: 2, z: 7 });

    const consumed = toolUse.handle(
      session,
      useWith("11111111-1111-4111-8111-111111111111", 1, ROPE_SPOT),
      1000,
    );

    expect(consumed).toBe(true);
    expect(player.position).toEqual({ x: 2, y: 2, z: 7 });
  });

  it("shovel opens an adjacent stone pile and drops the digger through", async () => {
    const harness = await makeHarness(
      [carriedItem("33333333-3333-4333-8333-333333333333", SHOVEL, "actor")],
      { pile: true },
    );

    const consumed = harness.toolUse.handle(
      harness.session,
      useWith("33333333-3333-4333-8333-333333333333", 1, PILE),
      1000,
    );

    expect(consumed).toBe(true);
    expect(
      harness.world.getMapItems(PILE).map((item) => item.itemId),
    ).toContain(OPEN_HOLE);
    expect(harness.player.position).toEqual(BELOW_PILE);
  });

  it("a player stepping onto a freshly dug hole falls one floor", async () => {
    const harness = await makeHarness(
      [carriedItem("33333333-3333-4333-8333-333333333333", SHOVEL, "actor")],
      { pile: true },
    );
    harness.toolUse.handle(
      harness.session,
      useWith("33333333-3333-4333-8333-333333333333", 1, PILE),
      1000,
    );
    // Clear the landing tile: the digger fell there first.
    harness.world.relocateCreature(harness.player, { x: 7, y: 7, z: 8 });
    const walker = new Player(makeCharacter("walker", "Walker"), {
      x: PILE.x,
      y: PILE.y + 1,
      z: PILE.z,
    });
    harness.world.addPlayer(walker);

    const result = harness.world.tryMove(walker, "north", 2000);

    expect(result.moved).toBe(true);
    expect(walker.position).toEqual({ x: PILE.x, y: PILE.y, z: PILE.z + 1 });
  });

  it("shovel on a tile without a diggable pile fails closed", async () => {
    const { player, session, sent, toolUse } = await makeHarness([
      carriedItem("33333333-3333-4333-8333-333333333333", SHOVEL, "actor"),
    ]);

    const consumed = toolUse.handle(
      session,
      useWith("33333333-3333-4333-8333-333333333333", 1, { x: 4, y: 5, z: 7 }),
      1000,
    );

    expect(consumed).toBe(true);
    expect(player.position).toEqual({ x: 5, y: 5, z: 7 });
    expect(
      sent.some(
        (message) =>
          message.type === "error" && message.code === "item-action-failed",
      ),
    ).toBe(true);
  });

  it("machete cuts jungle grass and drops nothing on the tile", async () => {
    const harness = await makeHarness(
      [carriedItem("44444444-4444-4444-8444-444444444444", MACHETE, "actor")],
      { items: [seededAt(JUNGLE_GRASS, PILE)] },
    );

    const consumed = harness.toolUse.handle(
      harness.session,
      useWith("44444444-4444-4444-8444-444444444444", 1, PILE),
      1000,
    );

    expect(consumed).toBe(true);
    expect(harness.world.getMapItems(PILE).map((item) => item.itemId)).toEqual([
      CUT_JUNGLE_GRASS,
    ]);
  });

  it("scythe cuts wheat and drops one bunch on the tile", async () => {
    const harness = await makeHarness(
      [carriedItem("44444444-4444-4444-8444-444444444444", SCYTHE, "actor")],
      { items: [seededAt(WHEAT, PILE)] },
    );

    harness.toolUse.handle(
      harness.session,
      useWith("44444444-4444-4444-8444-444444444444", 1, PILE),
      1000,
    );

    const ids = harness.world.getMapItems(PILE).map((item) => item.itemId);
    expect(ids).toContain(CUT_WHEAT);
    expect(ids).toContain(BUNCH_OF_WHEAT);
  });

  it("rejects a harvest on a tile that holds nothing cuttable", async () => {
    const harness = await makeHarness([
      carriedItem("44444444-4444-4444-8444-444444444444", SCYTHE, "actor"),
    ]);

    const consumed = harness.toolUse.handle(
      harness.session,
      useWith("44444444-4444-4444-8444-444444444444", 1, { x: 4, y: 5, z: 7 }),
      1000,
    );

    expect(consumed).toBe(true);
    expect(harness.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
  });

  it("rejects a forged harvest target beyond reach", async () => {
    const harness = await makeHarness(
      [carriedItem("44444444-4444-4444-8444-444444444444", MACHETE, "actor")],
      { items: [seededAt(JUNGLE_GRASS, PILE)] },
    );
    harness.player.moveTo({ x: 9, y: 7, z: 7 });

    harness.toolUse.handle(
      harness.session,
      useWith("44444444-4444-4444-8444-444444444444", 1, PILE),
      1000,
    );

    expect(harness.world.getMapItems(PILE).map((item) => item.itemId)).toEqual([
      JUNGLE_GRASS,
    ]);
    expect(harness.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
  });

  it("pick crushes a boulder, rolling gravel or a frazzlemaw server-side", async () => {
    const gravel = await makeHarness(
      [carriedItem("55555555-5555-4555-8555-555555555555", PICK, "actor")],
      { items: [seededAt(CRUSHABLE_STONE, PILE)], seed: 4 },
    );
    gravel.toolUse.handle(
      gravel.session,
      useWith("55555555-5555-4555-8555-555555555555", 1, PILE),
      1000,
    );
    const gravelIds = gravel.world
      .getMapItems(PILE)
      .map((item) => item.itemId);

    const beast = await makeHarness(
      [carriedItem("55555555-5555-4555-8555-555555555555", PICK, "actor")],
      { items: [seededAt(CRUSHABLE_STONE, PILE)], seed: 7 },
    );
    beast.toolUse.handle(
      beast.session,
      useWith("55555555-5555-4555-8555-555555555555", 1, PILE),
      1000,
    );
    const beastIds = beast.world.getMapItems(PILE).map((item) => item.itemId);

    // Whichever way each seed fell, the stone always became one of the two
    // crushed forms and never stayed intact.
    for (const ids of [gravelIds, beastIds]) {
      expect(ids).toHaveLength(1);
      expect([FINE_GRAVEL, CRUSHED_STONE]).toContain(ids[0]);
    }
    const spawnedFrazzlemaw = [...gravel.spawned, ...beast.spawned];
    for (const spawn of spawnedFrazzlemaw) {
      expect(spawn.typeName).toBe("frazzlemaw");
    }
  });

  it("fishing rod reaches shallow water from a distance and advances the skill", async () => {
    const harness = await makeHarness(
      [
        carriedItem("66666666-6666-4666-8666-666666666666", FISHING_ROD, "actor"),
        carriedItem("77777777-7777-4777-8777-777777777777", WORM, "actor"),
      ],
      { items: [seededAt(WATER, { x: 8, y: 5, z: 7 })] },
    );

    const consumed = harness.toolUse.handle(
      harness.session,
      useWith("66666666-6666-4666-8666-666666666666", 1, {
        x: 8,
        y: 5,
        z: 7,
      }),
      1000,
    );

    expect(consumed).toBe(true);
    expect(harness.progression.awardSkillTries).toHaveBeenCalledWith(
      "actor",
      expect.any(String),
      "fishing",
      1,
      1000,
    );
  });

  it("never advances fishing or catches without bait", async () => {
    const harness = await makeHarness(
      [carriedItem("66666666-6666-4666-8666-666666666666", FISHING_ROD, "actor")],
      { items: [seededAt(WATER, { x: 8, y: 5, z: 7 })] },
    );

    harness.toolUse.handle(
      harness.session,
      useWith("66666666-6666-4666-8666-666666666666", 1, {
        x: 8,
        y: 5,
        z: 7,
      }),
      1000,
    );

    expect(harness.progression.awardSkillTries).not.toHaveBeenCalled();
  });

  it("rejects a fishing target on another floor even within far-use range", async () => {
    const harness = await makeHarness(
      [carriedItem("66666666-6666-4666-8666-666666666666", FISHING_ROD, "actor")],
      { items: [seededAt(WATER, { x: 8, y: 5, z: 6 })] },
    );

    harness.toolUse.handle(
      harness.session,
      useWith("66666666-6666-4666-8666-666666666666", 1, {
        x: 8,
        y: 5,
        z: 6,
      }),
      1000,
    );

    expect(harness.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
  });

  it("crowbar stays fail-closed until quest storage ships", async () => {
    const harness = await makeHarness([
      carriedItem("88888888-8888-4888-8888-888888888888", CROWBAR, "actor"),
    ]);

    const consumed = harness.toolUse.handle(
      harness.session,
      useWith("88888888-8888-4888-8888-888888888888", 1, { x: 4, y: 5, z: 7 }),
      1000,
    );

    expect(consumed).toBe(true);
    expect(harness.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
  });

  it("rejects a shovel dig beyond reach", async () => {
    const harness = await makeHarness(
      [carriedItem("33333333-3333-4333-8333-333333333333", SHOVEL, "actor")],
      { pile: true },
    );
    harness.player.moveTo({ x: 8, y: 7, z: 7 });

    const consumed = harness.toolUse.handle(
      harness.session,
      useWith("33333333-3333-4333-8333-333333333333", 1, PILE),
      1000,
    );

    expect(consumed).toBe(true);
    expect(
      harness.world.getMapItems(PILE).map((item) => item.itemId),
    ).toContain(STONE_PILE);
    expect(harness.player.position).toEqual({ x: 8, y: 7, z: 7 });
  });
});
