import type { ServerMessage } from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { gridMapData } from "../gridMapData";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { MapData } from "../MapData";
import type { MapItem } from "../MapItem";
import { Player } from "../Player";
import { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { DepotService } from "./DepotService";
import type { DepotPage, DepotStore } from "./DepotStore";

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const depotPosition = { x: 11, y: 10, z: 7 } as const;

const depotPage: DepotPage = {
  snapshot: {
    depotRevision: 1,
    inboxRevision: 1,
    stashRevision: 1,
    depotCount: 0,
    inboxCount: 0,
    stashCount: 0,
  },
  totalEntries: 0,
  entries: [],
};

const mapDepot = (depotId: number): MapItem => ({
  instanceId: `depot-${depotId}`,
  itemId: 3497,
  stackIndex: 1,
  mutable: false,
  source: {
    seedKey: `depot-${depotId}`,
    mapName: "depot-test",
    mapVersion: "test",
    typeId: 3497,
    attributes: { depotId },
    position: depotPosition,
    stackIndex: 1,
    contents: [],
  },
});

const makeHarness = (store: Partial<DepotStore>) => {
  let depotId = 7;
  const base = gridMapData({
    name: "depot-test",
    width: 40,
    height: 40,
    blocked: [],
    floors: [7],
    towns: [
      { id: 7, name: "Thais" },
      { id: 8, name: "Carlin" },
    ],
  });
  const map: MapData = {
    ...base,
    getItems(position) {
      return position.x === depotPosition.x &&
        position.y === depotPosition.y &&
        position.z === depotPosition.z
        ? [mapDepot(depotId)]
        : [];
    },
  };
  const world = new World(map, 25);
  const player = new Player(makeCharacter("depot-player", "Depot Player"), {
    x: 10,
    y: 10,
    z: 7,
  });
  world.addPlayer(player);
  const messages: ServerMessage[] = [];
  const socket = {
    on: vi.fn(),
    readyState: 1,
    OPEN: 1,
    send: (data: string) => messages.push(JSON.parse(data) as ServerMessage),
  } as unknown as WebSocket;
  const session = new Session("depot-session", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = player.id;
  const applyCommittedMutation = vi.fn();
  const items = {
    applyCommittedMutation,
    trackExternalOperation: vi.fn(),
    inventorySnapshot: vi.fn(() => ({ items: [], capacityMax: 400 })),
    itemType: vi.fn(),
    itemTypesByName: vi.fn(() => []),
  } as unknown as ItemIntentHandler;
  const depot = new DepotService(world, items, store as DepotStore);
  return {
    world,
    player,
    session,
    messages,
    depot,
    applyCommittedMutation,
    replaceDepot(nextDepotId: number) {
      depotId = nextDepotId;
    },
  };
};

const openDepot = async (
  harness: ReturnType<typeof makeHarness>,
): Promise<string> => {
  expect(harness.depot.handleMapUse(harness.session, depotPosition)).toBe(true);
  await nextTurn();
  harness.depot.applyResolvedOutcomes();
  const opened = harness.messages.find(
    (message) => message.type === "depot-state",
  );
  if (!opened || opened.type !== "depot-state") {
    throw new Error("depot did not open");
  }
  return opened.sessionId;
};

describe("DepotService", () => {
  it("opens an adjacent map depot with a server-owned town id", async () => {
    const browse = vi.fn(async () => depotPage);
    const harness = makeHarness({ browse });

    await openDepot(harness);

    expect(browse).toHaveBeenCalledWith(
      harness.player.id,
      7,
      "depot",
      1,
      null,
    );
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "depot-state",
        depotId: 7,
        townName: "Thais",
      }),
    );
  });

  it("rejects access after the player leaves the reachable depot", async () => {
    const browse = vi.fn(async () => depotPage);
    const harness = makeHarness({ browse });
    const sessionId = await openDepot(harness);
    browse.mockClear();
    harness.world.relocateCreature(harness.player, { x: 30, y: 30, z: 7 });

    harness.depot.handle(harness.session, {
      type: "depot-browse",
      sessionId,
      location: "depot",
      page: 1,
      query: "",
    });

    expect(browse).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "depot-action-failed",
      reason: "out-of-range",
    });
  });

  it("rejects an intent when the map object no longer identifies that depot", async () => {
    const browse = vi.fn(async () => depotPage);
    const deposit = vi.fn();
    const harness = makeHarness({ browse, deposit });
    const sessionId = await openDepot(harness);
    harness.replaceDepot(8);

    harness.depot.handle(harness.session, {
      type: "depot-deposit",
      sessionId,
      depotRevision: 1,
      itemId: "11111111-1111-4111-8111-111111111111",
      itemRevision: 1,
    });

    expect(deposit).not.toHaveBeenCalled();
    expect(harness.messages).toContainEqual({
      type: "depot-action-failed",
      reason: "out-of-range",
    });
  });

  it("refreshes the authoritative depot page after a stale move", async () => {
    const browse = vi.fn(async () => depotPage);
    const deposit = vi.fn(async () => ({ status: "stale" as const }));
    const harness = makeHarness({ browse, deposit });
    const sessionId = await openDepot(harness);

    harness.depot.handle(harness.session, {
      type: "depot-deposit",
      sessionId,
      depotRevision: 1,
      itemId: "11111111-1111-4111-8111-111111111111",
      itemRevision: 1,
    });
    await nextTurn();
    harness.depot.applyResolvedOutcomes();

    expect(harness.messages).toContainEqual({
      type: "depot-action-failed",
      reason: "stale",
    });
    expect(browse).toHaveBeenCalledTimes(2);
  });

  it("reconciles a committed move even when access expires while it persists", async () => {
    let resolveDeposit:
      | ((result: {
          status: "committed";
          mutation: { after: [] };
          snapshot: DepotPage["snapshot"];
        }) => void)
      | undefined;
    const deposit = vi.fn(
      () =>
        new Promise<{
          status: "committed";
          mutation: { after: [] };
          snapshot: DepotPage["snapshot"];
        }>((resolve) => {
          resolveDeposit = resolve;
        }),
    );
    const harness = makeHarness({
      browse: vi.fn(async () => depotPage),
      deposit,
    });
    const sessionId = await openDepot(harness);

    harness.depot.handle(harness.session, {
      type: "depot-deposit",
      sessionId,
      depotRevision: 1,
      itemId: "11111111-1111-4111-8111-111111111111",
      itemRevision: 1,
    });
    harness.world.relocateCreature(harness.player, { x: 30, y: 30, z: 7 });
    resolveDeposit?.({
      status: "committed",
      mutation: { after: [] },
      snapshot: depotPage.snapshot,
    });
    await nextTurn();
    harness.depot.applyResolvedOutcomes();

    expect(harness.applyCommittedMutation).toHaveBeenCalledOnce();
    expect(harness.messages.at(-1)).toEqual({
      type: "depot-action-failed",
      reason: "out-of-range",
    });
  });
});
