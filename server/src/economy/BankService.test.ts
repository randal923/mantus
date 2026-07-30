import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
  type ServerMessage,
} from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { Npc } from "../creature/Npc";
import type { NpcType } from "../creature/NpcType";
import { gridMapData } from "../gridMapData";
import type { Item } from "../item/Item";
import { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { ItemType } from "../item/ItemType";
import { Player } from "../Player";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { makeNpcType } from "../test/makeNpcType";
import { World } from "../World";
import { BankService } from "./BankService";
import type { BankStore } from "./BankStore";
import type { EconomyPersistPlan } from "./EconomyPersistPlan";

const BACKPACK_TYPE = 2854;
const AXE = 3274;
const BACKPACK_ID = "test-backpack";

const makeItemType = (
  overrides: Partial<ItemType> & { id: number },
): ItemType => ({
  clientId: overrides.id,
  name: `type-${overrides.id}`,
  spriteId: 7_000 + overrides.id,
  stackable: false,
  maxCount: 1,
  weight: 100,
  pickupable: true,
  movable: true,
  light: { intensity: 0, color: 0 },
  elevation: 0,
  render: {
    ground: false,
    groundBorder: false,
    onBottom: false,
    onTop: false,
    stackable: false,
    fluidContainer: false,
    splash: false,
    hangable: false,
    hookSouth: false,
    hookEast: false,
    lyingCorpse: false,
    animateAlways: false,
    topEffect: false,
  },
  ...overrides,
});

const coinType = (id: number): ItemType =>
  makeItemType({ id, stackable: true, maxCount: 100, weight: 10 });

const itemCatalog = new ItemCatalog([
  makeItemType({
    id: BACKPACK_TYPE,
    equipmentSlot: "backpack",
    containerCapacity: 20,
    weight: 1_800,
  }),
  makeItemType({ id: AXE, weight: 100 }),
  makeItemType({ id: 2_000, weight: 100 }),
  coinType(GOLD_COIN_TYPE_ID),
  coinType(PLATINUM_COIN_TYPE_ID),
  coinType(CRYSTAL_COIN_TYPE_ID),
]);

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const bankerType: NpcType = makeNpcType({
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
      { id: "root", matches: [], responses: [], children: ["bank"], choices: [] },
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
});

const goldStack = (id: string, count: number, slot: number): Item => ({
  id,
  typeId: GOLD_COIN_TYPE_ID,
  count,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: BACKPACK_ID, slot },
});

const makeHarness = (options?: {
  store?: Partial<BankStore>;
  carried?: Item[];
  bankBalance?: number;
  capacityMax?: number;
  persistFails?: boolean;
}) => {
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
  const backpack: Item = {
    id: BACKPACK_ID,
    typeId: BACKPACK_TYPE,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "equipment", characterId: player.id, slot: "backpack" },
  };
  const items: ReadonlyArray<Item> = [backpack, ...(options?.carried ?? [])];
  const balances = new Map<string, number>([
    [player.id, options?.bankBalance ?? 0],
  ]);
  const applyCommittedMutation = vi.fn();
  const trackExternalOperation = vi.fn();
  const persisted: EconomyPersistPlan[] = [];
  const writes: Promise<void>[] = [];
  const persist = vi.fn(async (plan: EconomyPersistPlan) => {
    if (options?.persistFails) throw new Error("database exploded");
    persisted.push(plan);
  });
  const handler = {
    applyCommittedMutation,
    trackExternalOperation,
    inventorySnapshot: vi.fn((characterId: string) => ({
      items,
      capacityMax: options?.capacityMax ?? 400,
      bankBalance: balances.get(characterId) ?? 0,
    })),
    setBankBalance: vi.fn((characterId: string, balance: number) => {
      balances.set(characterId, balance);
    }),
    enqueuePersist: vi.fn(
      (_session: Session, _characterId: string, run: () => Promise<void>) => {
        writes.push(run());
      },
    ),
    runOrderedInternalOperation: vi.fn(<T>(run: () => Promise<T>) => run()),
    itemType: vi.fn((typeId: number) => itemCatalog.get(typeId)),
  } as unknown as ItemIntentHandler;
  const registry = new SessionRegistry();
  registry.add(session);
  registry.bindPlayer(session);
  const bank = new BankService(
    world,
    handler,
    itemCatalog,
    { persist },
    options?.store as BankStore | undefined,
    registry,
  );
  return {
    world,
    player,
    npc,
    session,
    messages,
    bank,
    registry,
    applyCommittedMutation,
    trackExternalOperation,
    persist,
    persisted,
    balanceOf: (characterId: string) => balances.get(characterId) ?? 0,
    settleWrites: async () => {
      await Promise.allSettled(writes);
    },
    /** Registers a second online character so pushes to them can be observed. */
    addRecipient(characterId: string) {
      const received: ServerMessage[] = [];
      const recipientSocket = {
        on: vi.fn(),
        readyState: 1,
        OPEN: 1,
        send: (data: string) =>
          received.push(JSON.parse(data) as ServerMessage),
      } as unknown as WebSocket;
      const recipientSession = new Session(
        "recipient-session",
        "127.0.0.1",
        recipientSocket,
        {
          maxPendingIntents: 16,
          maxProtocolViolations: 5,
          initialViewRange: { x: 9, y: 7 },
        },
      );
      recipientSession.playerId = characterId;
      registry.add(recipientSession);
      registry.bindPlayer(recipientSession);
      return received;
    },
  };
};

describe("BankService", () => {
  it("opens the bank straight from the cached balance", () => {
    const harness = makeHarness({ bankBalance: 1_234 });
    const onOpened = vi.fn();

    expect(
      harness.bank.open(harness.session, harness.npc, onOpened, vi.fn()),
    ).toBe("started");

    expect(onOpened).toHaveBeenCalledOnce();
    expect(harness.messages).toContainEqual({
      type: "bank-opened",
      npcId: "npc-naji",
      npcName: "Naji",
      balance: 1_234,
    });
  });

  it("refuses to open away from the banker", () => {
    const harness = makeHarness();
    harness.world.relocateCreature(harness.player, { x: 30, y: 30, z: 7 });

    expect(
      harness.bank.open(harness.session, harness.npc, vi.fn(), vi.fn()),
    ).toBe("unavailable");
  });

  it("deposits in the same tick and publishes the new balance", async () => {
    const harness = makeHarness({
      carried: [goldStack("coin", 100, 0)],
      bankBalance: 400,
    });

    harness.bank.handle(
      harness.session,
      { type: "bank-deposit", npcId: "npc-naji", amount: 100 },
      1_000,
    );

    // Nothing is awaited: the balance and the coins move immediately.
    expect(harness.session.itemOperationPending).toBe(false);
    expect(harness.applyCommittedMutation).toHaveBeenCalledOnce();
    expect(harness.balanceOf(harness.player.id)).toBe(500);
    expect(harness.messages).toContainEqual({
      type: "bank-updated",
      balance: 500,
    });

    await harness.settleWrites();
    expect(harness.persisted[0]?.bankOps).toEqual([
      {
        characterId: harness.player.id,
        delta: 100,
        expectedBalanceAfter: 500,
        ledger: "deposit",
      },
    ]);
    expect(harness.persisted[0]?.audits).toEqual([
      { kind: "bank-deposit", amount: 100, balanceAfter: 500 },
    ]);
  });

  it("withdraws in the same tick and lowers the balance", async () => {
    const harness = makeHarness({ bankBalance: 5_000 });

    harness.bank.handle(
      harness.session,
      { type: "bank-withdraw", npcId: "npc-naji", amount: 250 },
      1_000,
    );

    expect(harness.balanceOf(harness.player.id)).toBe(4_750);
    await harness.settleWrites();
    expect(harness.persisted[0]?.bankOps).toEqual([
      {
        characterId: harness.player.id,
        delta: -250,
        expectedBalanceAfter: 4_750,
        ledger: "withdraw",
      },
    ]);
  });

  it("never lets a withdrawal overdraw the balance", () => {
    const harness = makeHarness({ bankBalance: 100 });

    harness.bank.handle(
      harness.session,
      { type: "bank-withdraw", npcId: "npc-naji", amount: 101 },
      1_000,
    );

    expect(harness.persist).not.toHaveBeenCalled();
    expect(harness.balanceOf(harness.player.id)).toBe(100);
    expect(harness.messages).toContainEqual({
      type: "bank-action-failed",
      reason: "insufficient-balance",
    });
  });

  it("rejects a deposit that exceeds carried money", () => {
    const harness = makeHarness({ carried: [goldStack("coin", 40, 0)] });

    harness.bank.handle(
      harness.session,
      { type: "bank-deposit", npcId: "npc-naji", amount: 100 },
      1_000,
    );

    expect(harness.persist).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "bank-action-failed",
      reason: "insufficient-funds",
    });
  });

  it("rejects bank intents out of talk range at execution time", () => {
    const harness = makeHarness({ carried: [goldStack("coin", 100, 0)] });
    harness.world.relocateCreature(harness.player, { x: 30, y: 30, z: 7 });

    harness.bank.handle(
      harness.session,
      { type: "bank-deposit", npcId: "npc-naji", amount: 100 },
      1_000,
    );

    expect(harness.persist).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "bank-action-failed",
      reason: "out-of-range",
    });
  });

  it("serializes bank intents against pending DB-first operations", () => {
    const harness = makeHarness({ carried: [goldStack("coin", 100, 0)] });
    harness.session.itemOperationPending = true;

    harness.bank.handle(
      harness.session,
      { type: "bank-deposit", npcId: "npc-naji", amount: 100 },
      1_000,
    );

    expect(harness.persist).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "bank-action-failed",
      reason: "busy",
    });
  });

  it("rejects a withdrawal that cannot fit the coins", () => {
    const fullInventory = Array.from({ length: 20 }, (_, slot) => ({
      ...goldStack(`stack-${slot}`, 1, slot),
      typeId: 2_000,
    }));
    const harness = makeHarness({
      carried: fullInventory,
      bankBalance: 1_000_000,
      capacityMax: 100_000,
    });

    harness.bank.handle(
      harness.session,
      { type: "bank-withdraw", npcId: "npc-naji", amount: 10_000 },
      1_000,
    );

    expect(harness.persist).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "bank-action-failed",
      reason: "no-space",
    });
  });

  it("rejects a withdrawal heavier than the remaining capacity", () => {
    // The equipped backpack alone weighs the whole budget, so any coin is too
    // heavy even though there are free slots for it.
    const harness = makeHarness({ bankBalance: 1_000_000, capacityMax: 18 });

    harness.bank.handle(
      harness.session,
      { type: "bank-withdraw", npcId: "npc-naji", amount: 500 },
      1_000,
    );

    expect(harness.persist).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "bank-action-failed",
      reason: "no-capacity",
    });
  });

  it("forwards transfer outcomes and updates the sender's cached balance", async () => {
    const transfer = vi.fn(async () => ({
      status: "committed" as const,
      balance: 900,
      toCharacterId: "other",
      toBalance: 1_100,
    }));
    const harness = makeHarness({ store: { transfer }, bankBalance: 1_000 });

    harness.bank.handle(
      harness.session,
      {
        type: "bank-transfer",
        npcId: "npc-naji",
        toCharacterName: "Other Person",
        amount: 100,
      },
      1_000,
    );
    expect(harness.session.itemOperationPending).toBe(true);
    await nextTurn();
    harness.bank.applyResolvedOutcomes(2_000);

    expect(transfer).toHaveBeenCalledWith(
      harness.player.id,
      "Other Person",
      100,
    );
    expect(harness.session.itemOperationPending).toBe(false);
    expect(harness.balanceOf(harness.player.id)).toBe(900);
    expect(harness.messages).toContainEqual({
      type: "bank-updated",
      balance: 900,
    });
  });

  it("pushes only their own balance to an online recipient", async () => {
    const transfer = vi.fn(async () => ({
      status: "committed" as const,
      balance: 900,
      toCharacterId: "other",
      toBalance: 1_100,
    }));
    const harness = makeHarness({ store: { transfer } });
    const received = harness.addRecipient("other");

    harness.bank.handle(
      harness.session,
      {
        type: "bank-transfer",
        npcId: "npc-naji",
        toCharacterName: "Other Person",
        amount: 100,
      },
      1_000,
    );
    await nextTurn();
    harness.bank.applyResolvedOutcomes(2_000);

    // Their balance and nothing else — no sender name, no amount, no ledger.
    expect(received).toEqual([{ type: "bank-updated", balance: 1_100 }]);
    expect(harness.balanceOf("other")).toBe(1_100);
  });

  it("does not push when the recipient is offline", async () => {
    const transfer = vi.fn(async () => ({
      status: "committed" as const,
      balance: 900,
      toCharacterId: "offline-character",
      toBalance: 1_100,
    }));
    const harness = makeHarness({ store: { transfer } });

    harness.bank.handle(
      harness.session,
      {
        type: "bank-transfer",
        npcId: "npc-naji",
        toCharacterName: "Other Person",
        amount: 100,
      },
      1_000,
    );
    await nextTurn();

    expect(() => harness.bank.applyResolvedOutcomes(2_000)).not.toThrow();
    expect(harness.messages).toContainEqual({
      type: "bank-updated",
      balance: 900,
    });
  });

  it("reports a failed transfer without leaking details", async () => {
    const transfer = vi.fn(async () => {
      throw new Error("database exploded");
    });
    const harness = makeHarness({ store: { transfer } });

    harness.bank.handle(
      harness.session,
      {
        type: "bank-transfer",
        npcId: "npc-naji",
        toCharacterName: "Other Person",
        amount: 100,
      },
      1_000,
    );
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

  it("runs a keyword deposit through the same planning as the panel", () => {
    const harness = makeHarness({
      carried: [goldStack("gold-1", 100, 0)],
      bankBalance: 1_000,
    });
    const onCommitted = vi.fn();
    const onFailed = vi.fn();

    expect(
      harness.bank.handleKeyword(
        harness.session,
        harness.npc,
        "deposit",
        50,
        1_000,
        onCommitted,
        onFailed,
      ),
    ).toBe("started");

    expect(onCommitted).toHaveBeenCalledWith(1_050);
    expect(onFailed).not.toHaveBeenCalled();
    // Keyword replies come from the NPC, not the bank panel protocol.
    expect(harness.messages).toEqual([]);
  });

  it("rejects a keyword deposit larger than the carried coins", () => {
    const harness = makeHarness({ carried: [goldStack("gold-1", 10, 0)] });
    const onFailed = vi.fn();

    expect(
      harness.bank.handleKeyword(
        harness.session,
        harness.npc,
        "deposit",
        5_000,
        1_000,
        vi.fn(),
        onFailed,
      ),
    ).toBe("unavailable");

    expect(harness.persist).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith("insufficient-funds");
  });

  it("rejects a keyword deposit away from the banker", () => {
    const harness = makeHarness({ carried: [goldStack("gold-1", 100, 0)] });
    harness.world.relocateCreature(harness.player, { x: 30, y: 30, z: 7 });
    const onFailed = vi.fn();

    expect(
      harness.bank.handleKeyword(
        harness.session,
        harness.npc,
        "deposit",
        50,
        1_000,
        vi.fn(),
        onFailed,
      ),
    ).toBe("unavailable");

    expect(harness.persist).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith("out-of-range");
  });

  it("places withdrawn coins in nested bags when the backpack is full", () => {
    const nestedBag: Item = {
      id: "nested-bag",
      typeId: BACKPACK_TYPE,
      count: 1,
      attributes: {},
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
    };
    const filler = Array.from({ length: 19 }, (_, index) => ({
      id: `filler-${index}`,
      typeId: AXE,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "container" as const,
        containerId: BACKPACK_ID,
        slot: index + 1,
      },
    }));
    // The equipped backpack is full; only the nested bag has room.
    const harness = makeHarness({
      carried: [nestedBag, ...filler],
      bankBalance: 1_000,
      capacityMax: 100_000,
    });

    harness.bank.handle(
      harness.session,
      { type: "bank-withdraw", npcId: "npc-naji", amount: 100 },
      1_000,
    );

    expect(harness.messages).not.toContainEqual({
      type: "bank-action-failed",
      reason: "no-space",
    });
    expect(harness.balanceOf(harness.player.id)).toBe(900);
  });
});
