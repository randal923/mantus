import type { ServerMessage } from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { CharacterPersistence } from "../character/CharacterPersistence";
import type { CharacterStore } from "../character/CharacterStore";
import { Npc } from "../creature/Npc";
import type { NpcType } from "../creature/NpcType";
import { gridMapData } from "../gridMapData";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { Player } from "../Player";
import { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import type { Visibility } from "../Visibility";
import { World } from "../World";
import type { NpcTravelCommitResult } from "./NpcTravelCommitResult";
import type { NpcTravelStore } from "./NpcTravelStore";
import { TravelService } from "./TravelService";

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const npcType: NpcType = {
  id: "captain",
  name: "Captain",
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
        children: [],
        choices: [],
      },
    ],
    travelOffers: [],
  },
};

const makePersistence = () => {
  const store = {
    listByAccountId: vi.fn(async () => []),
    create: vi.fn(),
    findByIdForAccount: vi.fn(async () => null),
    recordLogin: vi.fn(async () => undefined),
    saveSnapshot: vi.fn(async (snapshot) => snapshot.expectedVersion + 1),
  } as unknown as CharacterStore;
  return new CharacterPersistence(store, 30_000, 0, 0);
};

const makeHarness = (
  commit: NpcTravelStore["commit"],
) => {
  const world = new World(
    gridMapData({
      name: "travel-test",
      width: 40,
      height: 40,
      blocked: [[20, 20]],
      floors: [6, 7],
    }),
    25,
  );
  const player = new Player(makeCharacter("traveller", "Traveller"), {
    x: 10,
    y: 10,
    z: 7,
  });
  const npc = new Npc({
    id: "npc-captain",
    type: npcType,
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
  const persistence = makePersistence();
  persistence.track(player, 0);
  const applyCommittedMutation = vi.fn();
  const trackExternalOperation = vi.fn();
  const items = {
    applyCommittedMutation,
    trackExternalOperation,
  } as unknown as ItemIntentHandler;
  const onPlayerTeleported = vi.fn();
  const visibility = { onPlayerTeleported } as unknown as Visibility;
  const store = { commit: vi.fn(commit) } satisfies NpcTravelStore;
  const travel = new TravelService(
    world,
    visibility,
    persistence,
    items,
    store,
  );
  return {
    world,
    player,
    npc,
    session,
    persistence,
    store,
    travel,
    applyCommittedMutation,
    trackExternalOperation,
    onPlayerTeleported,
  };
};

describe("TravelService", () => {
  it("serializes a pending intent and applies only the committed server destination", async () => {
    let resolveCommit: ((result: NpcTravelCommitResult) => void) | undefined;
    const commit = vi.fn(
      () =>
        new Promise<NpcTravelCommitResult>((resolve) => {
          resolveCommit = resolve;
        }),
    );
    const harness = makeHarness(commit);
    const onCommitted = vi.fn();
    const onFailed = vi.fn();
    const offer = {
      id: "carlin",
      cost: 10,
      destination: { x: 20, y: 20, z: 6 },
    };

    expect(
      harness.travel.start(
        harness.session,
        harness.npc,
        offer,
        1_000,
        onCommitted,
        onFailed,
      ),
    ).toBe("started");
    expect(
      harness.travel.start(
        harness.session,
        harness.npc,
        offer,
        1_000,
        onCommitted,
        onFailed,
      ),
    ).toBe("busy");
    expect(harness.session.itemOperationPending).toBe(true);
    expect(harness.session.travelOperationPending).toBe(true);
    expect(harness.trackExternalOperation).toHaveBeenCalledOnce();

    await nextTurn();
    expect(harness.store.commit).toHaveBeenCalledOnce();
    expect(harness.store.commit).toHaveBeenCalledWith(
      harness.player.id,
      1,
      { x: 19, y: 19, z: 6 },
      10,
      "captain",
      "carlin",
    );
    resolveCommit?.({
      status: "committed",
      characterVersion: 2,
      mutation: { after: [], removedItemIds: ["gold-stack"] },
    });
    await nextTurn();
    harness.travel.applyResolvedOutcomes(2_000);

    expect(harness.player.position).toEqual({ x: 19, y: 19, z: 6 });
    expect(harness.session.itemOperationPending).toBe(false);
    expect(harness.session.travelOperationPending).toBe(false);
    expect(harness.persistence.isExternalMutationPending(harness.player)).toBe(
      false,
    );
    expect(harness.applyCommittedMutation).toHaveBeenCalledOnce();
    expect(harness.onPlayerTeleported).toHaveBeenCalledOnce();
    expect(onCommitted).toHaveBeenCalledWith(2_000);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("does not move or spend when the atomic store rejects an insufficient fare", async () => {
    const harness = makeHarness(async () => ({
      status: "insufficient-funds",
    }));
    const onFailed = vi.fn();

    expect(
      harness.travel.start(
        harness.session,
        harness.npc,
        {
          id: "carlin",
          cost: 100,
          destination: { x: 20, y: 20, z: 6 },
        },
        1_000,
        vi.fn(),
        onFailed,
      ),
    ).toBe("started");
    await nextTurn();
    harness.travel.applyResolvedOutcomes(2_000);

    expect(harness.player.position).toEqual({ x: 10, y: 10, z: 7 });
    expect(harness.applyCommittedMutation).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith(2_000, "insufficient-funds");
    expect(
      harness.world.reservePosition(
        { x: 19, y: 19, z: 6 },
        "reservation-after-failure",
      ),
    ).toBe(true);
  });

  it("commits a server-selected diversion destination", async () => {
    const harness = makeHarness(async () => ({
      status: "committed",
      characterVersion: 2,
      mutation: { after: [], removedItemIds: ["gold-stack"] },
    }));

    expect(
      harness.travel.start(
        harness.session,
        harness.npc,
        {
          id: "ghostship",
          cost: 60,
          destination: { x: 20, y: 20, z: 6 },
          diversion: {
            oneIn: 1,
            destination: { x: 30, y: 30, z: 6 },
          },
        },
        1_000,
        vi.fn(),
        vi.fn(),
      ),
    ).toBe("started");
    await nextTurn();

    expect(harness.store.commit).toHaveBeenCalledWith(
      harness.player.id,
      1,
      { x: 30, y: 30, z: 6 },
      60,
      "captain",
      "ghostship",
    );
    harness.travel.applyResolvedOutcomes(2_000);
    expect(harness.player.position).toEqual({ x: 30, y: 30, z: 6 });
  });

  it("revalidates range and level before creating a store operation", () => {
    const harness = makeHarness(async () => ({
      status: "insufficient-funds",
    }));
    const offer = {
      id: "carlin",
      cost: 10,
      destination: { x: 20, y: 20, z: 6 },
      minimumLevel: 2,
    };

    expect(
      harness.travel.start(
        harness.session,
        harness.npc,
        offer,
        1_000,
        vi.fn(),
        vi.fn(),
      ),
    ).toBe("level-too-low");
    harness.world.relocateCreature(harness.player, { x: 30, y: 30, z: 7 });
    expect(
      harness.travel.start(
        harness.session,
        harness.npc,
        { ...offer, minimumLevel: 1 },
        1_000,
        vi.fn(),
        vi.fn(),
      ),
    ).toBe("unavailable");
    expect(harness.store.commit).not.toHaveBeenCalled();
  });
});
