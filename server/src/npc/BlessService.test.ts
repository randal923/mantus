import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import type { Account } from "../AccountStore";
import { CharacterPersistence } from "../character/CharacterPersistence";
import type { CharacterStore } from "../character/CharacterStore";
import { Npc } from "../creature/Npc";
import { gridMapData } from "../gridMapData";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { Player } from "../Player";
import { blessingMaskOf } from "../progression/blessings";
import { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import { makeNpcType } from "../test/makeNpcType";
import { World } from "../World";
import { BlessService } from "./BlessService";
import type { BlessStore } from "./BlessStore";

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const REGULAR_IDS = [2, 3, 4, 5, 6];

const npcType = makeNpcType({
  id: "henricus",
  name: "Henricus",
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
    greeting: ["Greetings."],
    farewell: ["Bye."],
    walkAway: ["Bye."],
    rootNodeId: "root",
    nodes: [{ id: "root", matches: [], responses: [], children: [], choices: [] }],
    travelOffers: [],
  },
});

const premiumAccount = (now: number): Account =>
  ({ premiumUntil: new Date(now + 24 * 60 * 60 * 1_000) }) as Account;
const freeAccount = (): Account => ({ premiumUntil: null }) as Account;

const makeHarness = (commit: BlessStore["commit"]) => {
  const world = new World(
    gridMapData({
      name: "bless-test",
      width: 40,
      height: 40,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const player = new Player(makeCharacter("believer", "Believer"), {
    x: 10,
    y: 10,
    z: 7,
  });
  const npc = new Npc({
    id: "npc-henricus",
    type: npcType,
    position: { x: 10, y: 12, z: 7 },
    direction: "south",
    home: { x: 10, y: 12, z: 7 },
    spawnRadius: 2,
  });
  world.addPlayer(player);
  world.addCreature(npc);
  const socket = {
    on: vi.fn(),
    readyState: 1,
    OPEN: 1,
    send: vi.fn(),
  } as unknown as WebSocket;
  const session = new Session("session", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = player.id;
  const characterStore = {
    listByAccountId: vi.fn(async () => []),
    create: vi.fn(),
    findByIdForAccount: vi.fn(async () => null),
    recordLogin: vi.fn(async () => undefined),
    saveSnapshot: vi.fn(async (snapshot) => snapshot.expectedVersion + 1),
  } as unknown as CharacterStore;
  const persistence = new CharacterPersistence(characterStore, 30_000, 0, 0);
  persistence.track(player, 0);
  const applyCommittedMutation = vi.fn();
  const items = {
    applyCommittedMutation,
    trackExternalOperation: vi.fn(),
  } as unknown as ItemIntentHandler;
  const store = { commit: vi.fn(commit) } satisfies BlessStore;
  const bless = new BlessService(world, persistence, items, store);
  return { player, session, npc, store, bless, applyCommittedMutation };
};

describe("BlessService", () => {
  it("refuses the premium bundle for a free account at execution time", () => {
    const { session, npc, bless, store } = makeHarness(vi.fn());
    session.account = freeAccount();
    const result = bless.start(
      session,
      npc,
      REGULAR_IDS,
      10,
      true,
      0,
      vi.fn(),
      vi.fn(),
    );
    expect(result).toBe("premium-required");
    expect(store.commit).not.toHaveBeenCalled();
  });

  it("refuses a purchase the player already holds without touching the store", () => {
    const { player, session, npc, bless, store } = makeHarness(vi.fn());
    player.grantBlessings(blessingMaskOf([5]));
    const result = bless.start(
      session,
      npc,
      [5],
      0,
      false,
      0,
      vi.fn(),
      vi.fn(),
    );
    expect(result).toBe("already-blessed");
    expect(store.commit).not.toHaveBeenCalled();
  });

  it("applies the committed grant to the player only after the transaction", async () => {
    const grantedMask = blessingMaskOf(REGULAR_IDS);
    const { player, session, npc, bless, store, applyCommittedMutation } =
      makeHarness(
        vi.fn(async () => ({
          status: "committed" as const,
          characterVersion: 2,
          grantedMask,
          price: 110_000,
          mutation: { after: [], removedItemIds: [] },
        })),
      );
    session.account = premiumAccount(0);
    const onCommitted = vi.fn();
    const result = bless.start(
      session,
      npc,
      REGULAR_IDS,
      10,
      true,
      0,
      onCommitted,
      vi.fn(),
    );
    expect(result).toBe("started");
    expect(session.itemOperationPending).toBe(true);
    expect(player.blessingsMask).toBe(0);

    await nextTurn();
    bless.applyResolvedOutcomes(5);

    expect(player.blessingsMask).toBe(grantedMask);
    expect(session.itemOperationPending).toBe(false);
    expect(onCommitted).toHaveBeenCalledWith(5);
    expect(applyCommittedMutation).toHaveBeenCalled();
    expect(store.commit).toHaveBeenCalledWith(
      player.id,
      player.version,
      REGULAR_IDS,
      10,
      "henricus",
    );
  });

  it("grants nothing and reports the reason when the store rejects the funds", async () => {
    const { player, session, npc, bless } = makeHarness(
      vi.fn(async () => ({ status: "insufficient-funds" as const })),
    );
    const onFailed = vi.fn();
    const result = bless.start(
      session,
      npc,
      [5],
      0,
      false,
      0,
      vi.fn(),
      onFailed,
    );
    expect(result).toBe("started");

    await nextTurn();
    bless.applyResolvedOutcomes(5);

    expect(player.blessingsMask).toBe(0);
    expect(session.itemOperationPending).toBe(false);
    expect(onFailed).toHaveBeenCalledWith(5, "insufficient-funds");
  });
});
