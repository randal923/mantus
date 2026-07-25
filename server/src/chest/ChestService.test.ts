import { describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import type { ChestDefinition } from "../action/ChestDefinition";
import { WorldActionRng } from "../action/WorldActionRng";
import { gridMapData } from "../gridMapData";
import type { ItemCatalog } from "../item/ItemCatalog";
import { ItemIntentHandler } from "../item/ItemIntentHandler";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { MemoryItemStore } from "../item/MemoryItemStore";
import { Player } from "../Player";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { ChestService } from "./ChestService";
import type { ChestLootRequest, ChestStore } from "./ChestStore";

const GOLD_COIN = 3_031;
const BAG = 2_853;

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let catalog: ItemCatalog | undefined;
const requireCatalog = async () => (catalog ??= await loadItemCatalog());

async function makeHarness(store?: ChestStore, capacityMax = 400) {
  const itemCatalog = await requireCatalog();
  const world = new World(
    gridMapData({ name: "test", width: 10, height: 8, blocked: [], items: [] }),
    25,
  );
  const registry = new SessionRegistry();
  const items = new ItemIntentHandler(
    new MemoryItemStore(),
    itemCatalog,
    world,
    new Visibility(world, registry),
  );
  const player = new Player(makeCharacter("hero"), { x: 5, y: 5, z: 7 });
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
  const session = new Session("hero", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = "hero";
  registry.add(session);
  items.attach(await items.load("hero", capacityMax));
  const chests = new ChestService(
    items,
    itemCatalog,
    new WorldActionRng(1_234),
    store,
  );
  return { chests, items, player, session, sent, itemCatalog };
}

function recordingStore(
  result: Awaited<ReturnType<ChestStore["loot"]>> = {
    status: "committed",
    mutation: { after: [] },
  },
) {
  const calls: ChestLootRequest[] = [];
  const store: ChestStore = {
    loot: async (_characterId, request) => {
      calls.push(request);
      return result;
    },
  };
  return { store, calls };
}

const chest = (overrides: Partial<ChestDefinition> = {}): ChestDefinition => ({
  uniqueId: 5_000,
  itemTypeId: 2_472,
  lootedKey: "chest-storage:3980",
  reward: [{ typeId: GOLD_COIN, count: 3 }],
  ...overrides,
});

describe("ChestService", () => {
  it("sends the server-decided reward request and reports the find", async () => {
    const { store, calls } = recordingStore();
    const harness = await makeHarness(store);
    harness.chests.loot(harness.session, harness.player, chest());
    await nextTurn();
    harness.chests.applyResolvedOutcomes(1_000);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      uniqueId: 5_000,
      lootedKey: "chest-storage:3980",
      rewards: [{ typeId: GOLD_COIN, count: 3, stackable: true }],
    });
    expect(calls[0]?.cooldownSeconds).toBeUndefined();
    expect(harness.sent.at(-1)).toMatchObject({
      type: "combat-log",
      text: "You have found gold coin.",
    });
  });

  it("reports an already-claimed gate as empty and grants nothing", async () => {
    const { store, calls } = recordingStore({ status: "already-looted" });
    const harness = await makeHarness(store);
    harness.chests.loot(harness.session, harness.player, chest());
    await nextTurn();
    harness.chests.applyResolvedOutcomes(1_000);

    expect(calls).toHaveLength(1);
    expect(harness.sent.at(-1)).toMatchObject({
      type: "combat-log",
      text: "It is empty.",
    });
  });

  it("refuses a second use while the first is still in flight", async () => {
    const { store, calls } = recordingStore();
    const harness = await makeHarness(store);
    harness.chests.loot(harness.session, harness.player, chest());
    harness.chests.loot(harness.session, harness.player, chest());
    await nextTurn();
    harness.chests.applyResolvedOutcomes(1_000);

    // The in-flight grant holds the session's item-operation lock, so the
    // replay never reaches the store at all.
    expect(calls).toHaveLength(1);
    expect(
      harness.sent.filter((message) => message.type === "error"),
    ).toMatchObject([{ code: "item-action-failed" }]);
  });

  it("rolls the random reward server-side, picking exactly one entry", async () => {
    const { store, calls } = recordingStore();
    const harness = await makeHarness(store);
    harness.chests.loot(
      harness.session,
      harness.player,
      chest({
        reward: [{ typeId: GOLD_COIN, count: 1 }],
        randomReward: [
          { typeId: 3_035, count: 2 },
          { typeId: 3_031, count: 7 },
        ],
      }),
    );
    await nextTurn();

    expect(calls[0]?.rewards).toHaveLength(1);
    expect([3_035, 3_031]).toContain(calls[0]?.rewards[0]?.typeId);
  });

  it("passes a repeatable chest's cooldown through in seconds", async () => {
    const { store, calls } = recordingStore();
    const harness = await makeHarness(store);
    harness.chests.loot(
      harness.session,
      harness.player,
      chest({ cooldownHours: 20 }),
    );
    await nextTurn();

    expect(calls[0]?.cooldownSeconds).toBe(72_000);
  });

  it("resolves a bagged reward's container capacity from the catalog", async () => {
    const { store, calls } = recordingStore();
    const harness = await makeHarness(store);
    harness.chests.loot(
      harness.session,
      harness.player,
      chest({ containerTypeId: BAG }),
    );
    await nextTurn();

    expect(calls[0]?.container).toEqual({ typeId: BAG, capacity: 8 });
  });

  it("refuses the use when the reward would exceed carry capacity", async () => {
    const { store, calls } = recordingStore();
    const harness = await makeHarness(store, 1);
    harness.chests.loot(
      harness.session,
      harness.player,
      chest({ reward: [{ typeId: 3_031, count: 100 }] }),
    );
    await nextTurn();

    expect(calls).toHaveLength(0);
    expect(harness.sent.at(-1)).toMatchObject({
      type: "combat-log",
      text: "You have no room to take it.",
    });
  });

  it("fails closed without a chest store", async () => {
    const harness = await makeHarness();
    harness.chests.loot(harness.session, harness.player, chest());
    expect(harness.sent.at(-1)).toMatchObject({
      type: "error",
      code: "item-action-failed",
    });
  });
});
