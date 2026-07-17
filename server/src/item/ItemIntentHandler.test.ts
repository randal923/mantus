import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { Player } from "../Player";
import { Session } from "../Session";
import { gridMapData } from "../gridMapData";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import type { Item } from "./Item";
import { ItemCatalog } from "./ItemCatalog";
import { ItemIntentHandler } from "./ItemIntentHandler";
import { loadItemCatalog } from "./loadItemCatalog";
import { MemoryItemStore } from "./MemoryItemStore";

const CHARACTER_ID = "3d2af45f-e037-44f5-bd50-7bc655c6cd0e";
const BACKPACK_ID = "41868798-fc9b-43ac-bf28-4f52bf64c4eb";
const POUCH_ID = "db85bce3-0fc9-49f4-87ff-dda53f3cc8c1";
const ITEM_ID = "434b8502-04e2-4e3b-875d-f9be2153016c";
const LETTER_ID = "b676077c-f53f-49cc-89a7-ab4c7ca196ef";
const FOOD_ID = "97f88f8b-1ac2-4bf5-9272-906666c7d870";

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

describe("ItemIntentHandler", () => {
  it("keeps the inventory capacity projection in sync with level gains", async () => {
    const world = new World(
      gridMapData({
        name: "test",
        width: 3,
        height: 3,
        blocked: [],
      }),
      25,
    );
    const handler = new ItemIntentHandler(
      new MemoryItemStore(),
      new ItemCatalog([]),
      world,
      new Visibility(world, new SessionRegistry()),
    );
    handler.attach(await handler.load("character-id", 400));

    expect(handler.updateCapacity("character-id", 425)).toMatchObject({
      revision: 1,
      capacityMax: 425,
    });
    expect(handler.updateCapacity("character-id", 425)).toBeNull();
  });

  it("opens nested containers and moves an item into a revisioned container", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "open-container",
      itemId: POUCH_ID,
      revision: 1,
    });
    expect(sent.at(-1)).toMatchObject({
      type: "inventory-updated",
      inventory: {
        containers: [
          {
            container: { id: POUCH_ID },
            items: [{ item: { id: ITEM_ID } }],
          },
        ],
      },
    });

    handler.handle(session, {
      type: "move-item",
      itemId: ITEM_ID,
      revision: 1,
      destinationContainerId: BACKPACK_ID,
      destinationRevision: 1,
      destinationSlot: 1,
    });
    await handler.load(CHARACTER_ID, 400);
    handler.applyResolvedOutcomes(1_000);

    expect(sent.at(-1)).toMatchObject({
      type: "inventory-updated",
      inventory: {
        items: expect.arrayContaining([
          expect.objectContaining({
            slot: 1,
            item: expect.objectContaining({ id: ITEM_ID, revision: 2 }),
          }),
        ]),
        containers: [
          expect.objectContaining({
            container: expect.objectContaining({ id: POUCH_ID }),
            items: [],
          }),
        ],
      },
    });
  });

  it("reads and atomically writes bounded owned item text", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    store.seed({
      id: LETTER_ID,
      typeId: 3505,
      count: 1,
      attributes: { text: "Before" },
      version: 1,
      location: {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 2,
      },
    });
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(session, {
      type: "use-item",
      itemId: LETTER_ID,
      revision: 1,
    });
    expect(sent.at(-1)).toMatchObject({
      type: "item-text",
      itemId: LETTER_ID,
      text: "Before",
      writeable: true,
    });

    handler.handle(session, {
      type: "write-item",
      itemId: LETTER_ID,
      revision: 1,
      text: "After",
    });
    await handler.load(CHARACTER_ID, 400);
    handler.applyResolvedOutcomes(1_000);
    handler.handle(session, {
      type: "use-item",
      itemId: LETTER_ID,
      revision: 2,
    });

    expect(sent.at(-1)).toMatchObject({
      type: "item-text",
      itemId: LETTER_ID,
      revision: 2,
      text: "After",
    });
  });

  it("commits a move without publishing to a disconnected projection", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    const { handler, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));
    const sentBefore = sent.length;

    handler.handle(session, {
      type: "move-item",
      itemId: ITEM_ID,
      revision: 1,
      destinationContainerId: BACKPACK_ID,
      destinationRevision: 1,
      destinationSlot: 1,
    });
    handler.detach(CHARACTER_ID);
    session.playerId = null;
    const durable = await handler.load(CHARACTER_ID, 400);
    handler.applyResolvedOutcomes(1_000);

    expect(sent).toHaveLength(sentBefore);
    expect(durable.items).toContainEqual(
      expect.objectContaining({
        id: ITEM_ID,
        version: 2,
        location: expect.objectContaining({
          kind: "container",
          containerId: BACKPACK_ID,
        }),
      }),
    );
  });

  it("consumes food before applying bounded regeneration and rejects fullness", async () => {
    const store = new MemoryItemStore();
    for (const item of nestedItems()) store.seed(item);
    store.seed({
      id: FOOD_ID,
      typeId: 3577,
      count: 2,
      attributes: {},
      version: 1,
      location: {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 2,
      },
    });
    const { handler, player, session, sent } = makeHarness(store);
    handler.attach(await handler.load(CHARACTER_ID, 400));

    handler.handle(
      session,
      {
        type: "use-item",
        itemId: FOOD_ID,
        revision: 1,
      },
      0,
    );
    await handler.load(CHARACTER_ID, 400);
    handler.applyResolvedOutcomes(100);

    expect(player.conditions.remainingMs("regeneration", 100)).toBe(180_000);
    expect(sent).toContainEqual({
      type: "combat-log",
      kind: "condition",
      text: "Munch.",
    });
    expect(await store.loadForCharacter(CHARACTER_ID)).toContainEqual(
      expect.objectContaining({ id: FOOD_ID, count: 1, version: 2 }),
    );

    player.conditions.apply(
      {
        type: "regeneration",
        sourceId: player.id,
        durationMs: 1_100_000,
      },
      100,
    );
    handler.handle(
      session,
      {
        type: "use-item",
        itemId: FOOD_ID,
        revision: 2,
      },
      100,
    );

    expect(sent.at(-1)).toEqual({ type: "error", code: "player-full" });
    expect(await store.loadForCharacter(CHARACTER_ID)).toContainEqual(
      expect.objectContaining({ id: FOOD_ID, count: 1, version: 2 }),
    );
  });
});

function nestedItems(): Item[] {
  return [
    {
      id: BACKPACK_ID,
      typeId: 2854,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "equipment",
        characterId: CHARACTER_ID,
        slot: "backpack",
      },
    },
    {
      id: POUCH_ID,
      typeId: 2853,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "container",
        containerId: BACKPACK_ID,
        slot: 0,
      },
    },
    {
      id: ITEM_ID,
      typeId: 3273,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "container",
        containerId: POUCH_ID,
        slot: 0,
      },
    },
  ];
}

function makeHarness(store: MemoryItemStore): {
  handler: ItemIntentHandler;
  player: Player;
  session: Session;
  sent: ServerMessage[];
} {
  const world = new World(
    gridMapData({
      name: "test",
      width: 3,
      height: 3,
      blocked: [],
    }),
    25,
  );
  const player = new Player(
    makeCharacter(CHARACTER_ID, "Container Tester"),
    {
      x: 1,
      y: 1,
      z: 7,
    },
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
  const session = new Session("session", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = CHARACTER_ID;
  return {
    handler: new ItemIntentHandler(
      store,
      catalog,
      world,
      new Visibility(world, new SessionRegistry()),
    ),
    player,
    session,
    sent,
  };
}
