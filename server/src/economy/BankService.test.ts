import type { ServerMessage } from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { Npc } from "../creature/Npc";
import type { NpcType } from "../creature/NpcType";
import { gridMapData } from "../gridMapData";
import type { Item } from "../item/Item";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { Player } from "../Player";
import { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import type { BankStore } from "./BankStore";
import { BankService } from "./BankService";

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const bankerType: NpcType = {
  id: "naji",
  name: "Naji",
  outfit: { lookType: 129, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
  health: 100,
  maxHealth: 100,
  speed: 100,
  walkIntervalMs: 2_000,
  walkRadius: 2,
  dialogue: {
    talkRange: 4,
    timeoutMs: 30_000,
    greetingKeywords: ["hi"],
    farewellKeywords: ["bye"],
    greeting: ["Hello."],
    farewell: ["Bye."],
    walkAway: ["Bye."],
    rootNodeId: "root",
    nodes: [
      {
        id: "root",
        matches: [],
        responses: [],
        children: ["bank"],
        choices: [],
      },
      {
        id: "bank",
        matches: [["bank"]],
        responses: ["Here you go."],
        children: [],
        choices: [],
        nextNodeId: "root",
        action: { kind: "bank" },
      },
    ],
    travelOffers: [],
  },
};

const goldStack = (id: string, count: number, slot: number): Item => ({
  id,
  typeId: 3031,
  count,
  attributes: {},
  version: 1,
  location: { kind: "inventory", characterId: "banker-test", slot },
});

const makeHarness = (store: Partial<BankStore>, carried: Item[] = []) => {
  const world = new World(
    gridMapData({
      name: "bank-test",
      width: 40,
      height: 40,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const player = new Player(makeCharacter("customer", "Customer"), {
    x: 10,
    y: 10,
    z: 7,
  });
  const npc = new Npc({
    id: "npc-naji",
    type: bankerType,
    position: { x: 10, y: 12, z: 7 },
    direction: "south",
    home: { x: 10, y: 12, z: 7 },
    spawnRadius: 2,
  });
  world.addPlayer(player);
  world.addCreature(npc);
  const messages: ServerMessage[] = [];
  const socket = {
    on: vi.fn(),
    readyState: 1,
    OPEN: 1,
    send: (data: string) => messages.push(JSON.parse(data) as ServerMessage),
  } as unknown as WebSocket;
  const session = new Session("session", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = player.id;
  session.knownCreatureIds.add(npc.id);
  const applyCommittedMutation = vi.fn();
  const trackExternalOperation = vi.fn();
  const backpack: Item = {
    id: "test-backpack",
    typeId: 2854,
    count: 1,
    attributes: {},
    version: 1,
    location: {
      kind: "equipment",
      characterId: player.id,
      slot: "backpack",
    },
  };
  const items = {
    applyCommittedMutation,
    trackExternalOperation,
    inventorySnapshot: vi.fn(() => ({
      items: [backpack, ...carried],
      capacityMax: 400,
    })),
    itemType: vi.fn((typeId: number) =>
      typeId === backpack.typeId
        ? { weight: 1800, containerCapacity: 20 }
        : { weight: 10 },
    ),
  } as unknown as ItemIntentHandler;
  const bank = new BankService(world, items, store as BankStore);
  return {
    world,
    player,
    npc,
    session,
    messages,
    bank,
    applyCommittedMutation,
    trackExternalOperation,
  };
};

describe("BankService", () => {
  it("opens the bank and reports the stored balance", async () => {
    const harness = makeHarness({ balance: vi.fn(async () => 1_234) });
    const onOpened = vi.fn();

    expect(
      harness.bank.open(harness.session, harness.npc, onOpened, vi.fn()),
    ).toBe("started");
    await nextTurn();
    harness.bank.applyResolvedOutcomes(1_000);

    expect(onOpened).toHaveBeenCalledOnce();
    expect(harness.messages).toContainEqual({
      type: "bank-opened",
      npcId: "npc-naji",
      npcName: "Naji",
      balance: 1_234,
    });
  });

  it("refuses to open away from the banker", () => {
    const harness = makeHarness({ balance: vi.fn(async () => 0) });
    harness.world.relocateCreature(harness.player, { x: 30, y: 30, z: 7 });

    expect(
      harness.bank.open(harness.session, harness.npc, vi.fn(), vi.fn()),
    ).toBe("unavailable");
  });

  it("applies a committed deposit and publishes the new balance", async () => {
    const mutation = { after: [], removedItemIds: ["coin"] };
    const deposit = vi.fn(async () => ({
      status: "committed" as const,
      balance: 500,
      mutation,
    }));
    const harness = makeHarness({ deposit }, [goldStack("coin", 100, 0)]);

    harness.bank.handle(harness.session, {
      type: "bank-deposit",
      npcId: "npc-naji",
      amount: 100,
    });
    expect(harness.session.itemOperationPending).toBe(true);
    await nextTurn();
    harness.bank.applyResolvedOutcomes(2_000);

    expect(deposit).toHaveBeenCalledWith(harness.player.id, 100);
    expect(harness.session.itemOperationPending).toBe(false);
    expect(harness.applyCommittedMutation).toHaveBeenCalledOnce();
    expect(harness.trackExternalOperation).toHaveBeenCalledOnce();
    expect(harness.messages).toContainEqual({
      type: "bank-updated",
      balance: 500,
    });
  });

  it("rejects a deposit that exceeds carried money before touching the store", () => {
    const deposit = vi.fn();
    const harness = makeHarness({ deposit }, [goldStack("coin", 40, 0)]);

    harness.bank.handle(harness.session, {
      type: "bank-deposit",
      npcId: "npc-naji",
      amount: 100,
    });

    expect(deposit).not.toHaveBeenCalled();
    expect(harness.session.itemOperationPending).toBe(false);
    expect(harness.messages).toContainEqual({
      type: "bank-action-failed",
      reason: "insufficient-funds",
    });
  });

  it("rejects bank intents out of talk range at execution time", () => {
    const deposit = vi.fn();
    const harness = makeHarness({ deposit }, [goldStack("coin", 100, 0)]);
    harness.world.relocateCreature(harness.player, { x: 30, y: 30, z: 7 });

    harness.bank.handle(harness.session, {
      type: "bank-deposit",
      npcId: "npc-naji",
      amount: 100,
    });

    expect(deposit).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "bank-action-failed",
      reason: "out-of-range",
    });
  });

  it("serializes bank intents against pending item operations", () => {
    const deposit = vi.fn();
    const harness = makeHarness({ deposit }, [goldStack("coin", 100, 0)]);
    harness.session.itemOperationPending = true;

    harness.bank.handle(harness.session, {
      type: "bank-deposit",
      npcId: "npc-naji",
      amount: 100,
    });

    expect(deposit).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "bank-action-failed",
      reason: "busy",
    });
  });

  it("rejects a withdrawal that cannot fit the coins", () => {
    const withdraw = vi.fn();
    const fullInventory = Array.from({ length: 100 }, (_, slot) => ({
      ...goldStack(`stack-${slot}`, 1, slot),
      typeId: 2_000,
    }));
    const harness = makeHarness({ withdraw }, fullInventory);

    harness.bank.handle(harness.session, {
      type: "bank-withdraw",
      npcId: "npc-naji",
      amount: 10_000,
    });

    expect(withdraw).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "bank-action-failed",
      reason: "no-space",
    });
  });

  it("reports a failed store operation without leaking details", async () => {
    const withdraw = vi.fn(async () => {
      throw new Error("database exploded");
    });
    const harness = makeHarness({ withdraw });

    harness.bank.handle(harness.session, {
      type: "bank-withdraw",
      npcId: "npc-naji",
      amount: 100,
    });
    await nextTurn();
    harness.bank.applyResolvedOutcomes(2_000);

    expect(harness.session.itemOperationPending).toBe(false);
    expect(harness.messages).toContainEqual({
      type: "bank-action-failed",
      reason: "failed",
    });
    expect(
      harness.messages.some((message) =>
        JSON.stringify(message).includes("exploded"),
      ),
    ).toBe(false);
  });

  it("forwards transfer outcomes", async () => {
    const transfer = vi.fn(async () => ({
      status: "committed" as const,
      balance: 900,
      toCharacterId: "other",
    }));
    const harness = makeHarness({ transfer });

    harness.bank.handle(harness.session, {
      type: "bank-transfer",
      npcId: "npc-naji",
      toCharacterName: "Other Person",
      amount: 100,
    });
    await nextTurn();
    harness.bank.applyResolvedOutcomes(2_000);

    expect(transfer).toHaveBeenCalledWith(
      harness.player.id,
      "Other Person",
      100,
    );
    expect(harness.messages).toContainEqual({
      type: "bank-updated",
      balance: 900,
    });
  });
});
