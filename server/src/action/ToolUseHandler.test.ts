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
import { MovementHandler } from "../MovementHandler";
import { Player } from "../Player";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { ToolUseHandler } from "./ToolUseHandler";

const ROPE = 3_003;
const SHOVEL = 3_457;
const APPLE = 3_585;
const STONE_PILE = 593;
const OPEN_HOLE = 594;
const ROPE_SPOT = { x: 5, y: 4, z: 7 } as const;
const ROPE_DESTINATION = { x: 5, y: 5, z: 6 } as const;
const PILE = { x: 4, y: 4, z: 7 } as const;
const BELOW_PILE = { x: 4, y: 4, z: 8 } as const;

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
    location: { kind: "inventory", characterId, slot: 0 },
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

async function makeHarness(
  inventory: ReadonlyArray<Item>,
  options: { pile?: boolean } = {},
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
      items: options.pile ? [seededPile(STONE_PILE)] : [],
    }),
    25,
  );
  const registry = new SessionRegistry();
  const visibility = new Visibility(world, registry);
  const store = new MemoryItemStore();
  for (const item of inventory) store.seed(item);
  const items = new ItemIntentHandler(store, catalog, world, visibility);
  const persistence = {
    markDirty: vi.fn(),
    saveNow: vi.fn(),
  } as unknown as CharacterPersistence;
  const movement = new MovementHandler(world, visibility, persistence);
  const toolUse = new ToolUseHandler(world, catalog, items, movement);

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
  return { world, player, session, sent, toolUse };
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
