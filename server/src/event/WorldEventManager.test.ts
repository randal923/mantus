import { describe, expect, it, vi } from "vitest";
import type { Position, ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { WorldActionRng } from "../action/WorldActionRng";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { makeMonsterType } from "../test/makeMonsterType";
import { SpawnManager } from "../spawn/SpawnManager";
import type { Visibility } from "../Visibility";
import { World } from "../World";
import { WorldEventManager } from "./WorldEventManager";
import type { WorldEventDefinition } from "./WorldEventDefinition";
import type {
  ClaimedWorldEventCheck,
  WorldEventStore,
} from "./WorldEventStore";

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const EVENT: WorldEventDefinition = {
  id: "test.raid",
  sourcePath: "test",
  areas: [{ from: { x: 2, y: 2, z: 7 }, to: { x: 8, y: 6, z: 7 } }],
  allowedDays: [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ],
  minActivePlayers: 0,
  initialChance: 100,
  targetChancePerDay: 100,
  maxChancePerCheck: 100,
  stages: [
    { kind: "announce", message: "The rats are coming!", advanceAfterMs: 10 },
    {
      kind: "spawn",
      monsters: [{ name: "Rat", amount: 3 }],
      advanceAfterMs: 10,
    },
  ],
};

/**
 * An in-memory store with the same lease semantics as the Postgres one: a
 * claim advances the deadline as it is handed out, and a run key can only be
 * inserted once.
 */
function makeStore(options: { checkedAt?: Date } = {}) {
  const state = {
    nextCheckAt: 0,
    failedAttempts: 0,
    checksToday: 0,
    triggerWhenPossible: false,
    lastOccurrenceAt: null as Date | null,
    enabled: true,
  };
  const runs = new Map<string, { eventId: string; status: string }>();
  const operatorActions: Array<{ action: string; accepted: boolean }> = [];
  const checkedAt = options.checkedAt ?? new Date("2026-07-20T12:00:00.000Z");
  const store: WorldEventStore = {
    register: async () => {},
    claimDueChecks: async (
      now,
      checkIntervalMs,
    ): Promise<ReadonlyArray<ClaimedWorldEventCheck>> => {
      if (!state.enabled || now.getTime() < state.nextCheckAt) return [];
      state.nextCheckAt = now.getTime() + checkIntervalMs;
      return [
        {
          eventId: EVENT.id,
          failedAttempts: state.failedAttempts,
          checksToday: state.checksToday,
          triggerWhenPossible: state.triggerWhenPossible,
          lastOccurrenceAt: state.lastOccurrenceAt,
          checkedAt,
        },
      ];
    },
    recordCheckOutcome: async (outcome) => {
      state.failedAttempts = outcome.failedAttempts;
      state.checksToday = outcome.checksToday;
      state.triggerWhenPossible = outcome.triggerWhenPossible;
      if (outcome.fired) state.lastOccurrenceAt = checkedAt;
    },
    beginRun: async (run) => {
      if (runs.has(run.idempotencyKey)) return false;
      runs.set(run.idempotencyKey, {
        eventId: run.eventId,
        status: "running",
      });
      return true;
    },
    finishRun: async (key) => {
      const run = runs.get(key);
      if (run) run.status = "completed";
    },
    abandonStaleRuns: async () => {
      let abandoned = 0;
      for (const run of runs.values()) {
        if (run.status !== "running") continue;
        run.status = "abandoned";
        abandoned += 1;
      }
      return abandoned;
    },
    recordOperatorAction: async (action) => {
      operatorActions.push({
        action: action.action,
        accepted: action.accepted,
      });
    },
    setEnabled: async (_eventId, enabled) => {
      state.enabled = enabled;
    },
  };
  return { store, state, runs, operatorActions, checkedAt };
}

/**
 * A town whose interior (x 2..6, y 2..6) is a protection zone while the
 * event's area (x 2..8, y 2..6) also covers the two street columns east of it,
 * the way Thais' rat raid area covers the whole town, temple and depot included.
 */
const TOWN_PROTECTION_ZONE: ReadonlyArray<readonly [number, number, number]> =
  Array.from({ length: 25 }, (_, index) => [2 + (index % 5), 2 + Math.floor(index / 5), 7] as const);

function makeHarness(
  store?: WorldEventStore,
  options: {
    events?: ReadonlyMap<string, WorldEventDefinition>;
    protectionZones?: ReadonlyArray<readonly [number, number, number]>;
    spawnMonster?: (
      world: World,
      name: string,
      position: Position,
      now: number,
    ) => boolean;
  } = {},
) {
  const world = new World(
    gridMapData({
      name: "test",
      width: 12,
      height: 10,
      blocked: [],
      items: [],
      protectionZones: options.protectionZones,
    }),
    25,
  );
  const registry = new SessionRegistry();
  const spawned: Array<{ name: string; position: Position }> = [];
  const manager = new WorldEventManager(
    world,
    registry,
    options.events ?? new Map([[EVENT.id, EVENT]]),
    new WorldActionRng(7),
    (name, position, now) => {
      spawned.push({ name, position: { ...position } });
      if (!options.spawnMonster) return true;
      return options.spawnMonster(world, name, position, now);
    },
    store,
    () => new Date("2026-07-20T12:00:00.000Z"),
  );
  const sent: ServerMessage[] = [];
  const socket = {
    OPEN: 1,
    readyState: 1,
    on: vi.fn(),
    send: vi.fn((value: string) => {
      sent.push(JSON.parse(value) as ServerMessage);
    }),
  } as unknown as WebSocket;
  const session = new Session("watcher", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = "watcher";
  registry.add(session);
  world.addPlayer(new Player(makeCharacter("watcher"), { x: 1, y: 1, z: 7 }));
  return { world, manager, spawned, sent, session };
}

describe("WorldEventManager", () => {
  it("rolls, fires, announces, and spawns inside the event's area", async () => {
    const { store } = makeStore();
    const harness = makeHarness(store);
    await harness.manager.start();

    harness.manager.tick(1_000);
    await nextTurn();
    // The announce stage runs on the next tick once the run is registered.
    harness.manager.tick(1_010);
    expect(harness.sent.at(-1)).toMatchObject({
      type: "combat-log",
      text: "The rats are coming!",
    });

    harness.manager.tick(1_030);
    expect(harness.spawned).toHaveLength(3);
    for (const spawn of harness.spawned) {
      expect(spawn.name).toBe("Rat");
      expect(spawn.position.x).toBeGreaterThanOrEqual(2);
      expect(spawn.position.x).toBeLessThanOrEqual(8);
      expect(spawn.position.y).toBeGreaterThanOrEqual(2);
      expect(spawn.position.y).toBeLessThanOrEqual(6);
      expect(spawn.position.z).toBe(7);
    }
    await harness.manager.stop();
  });

  it("fires exactly once when two managers race the same schedule", async () => {
    const { store, runs } = makeStore();
    const first = makeHarness(store);
    const second = makeHarness(store);
    await first.manager.start();
    await second.manager.start();

    first.manager.tick(1_000);
    second.manager.tick(1_000);
    await nextTurn();

    // The claim advanced the deadline, so only one manager saw the check.
    expect(runs.size).toBe(1);
    const started = [...first.manager.activeEventIds, ...second.manager.activeEventIds];
    expect(started).toEqual([EVENT.id]);
    await first.manager.stop();
    await second.manager.stop();
  });

  it("never re-runs a fire whose idempotency key already exists", async () => {
    const { store, runs } = makeStore();
    const harness = makeHarness(store);
    await harness.manager.start();
    harness.manager.tick(1_000);
    await nextTurn();
    // Drain the run so the manager is idle again, then let the same check fire.
    for (let now = 1_010; now <= 1_100; now += 10) harness.manager.tick(now);
    await nextTurn();
    expect(harness.manager.activeEventIds).toEqual([]);

    // A second sweep at the same stored checkedAt derives the same key.
    harness.manager.tick(120_000);
    await nextTurn();

    expect(runs.size).toBe(1);
    expect(harness.spawned).toHaveLength(3);
    await harness.manager.stop();
  });

  it("abandons an interrupted run at startup instead of resuming it", async () => {
    const { store, runs } = makeStore();
    const crashed = makeHarness(store);
    await crashed.manager.start();
    crashed.manager.tick(1_000);
    await nextTurn();
    crashed.manager.tick(1_010);
    expect(runs.size).toBe(1);
    await crashed.manager.stop();

    const restarted = makeHarness(store);
    await restarted.manager.start();

    expect([...runs.values()].map((run) => run.status)).toEqual(["abandoned"]);
    expect(restarted.manager.activeEventIds).toEqual([]);
    expect(restarted.spawned).toEqual([]);
    await restarted.manager.stop();
  });

  it("does not restart an event whose run is still in flight", async () => {
    const { store, runs, state } = makeStore();
    const harness = makeHarness(store);
    await harness.manager.start();
    harness.manager.tick(1_000);
    await nextTurn();
    harness.manager.tick(1_010);
    expect(harness.manager.activeEventIds).toEqual([EVENT.id]);

    // Force another sweep while the run is mid-flight.
    state.nextCheckAt = 0;
    harness.manager.tick(2_000);
    await nextTurn();

    expect(runs.size).toBe(1);
    await harness.manager.stop();
  });

  it("audits an operator start and refuses an unknown event", async () => {
    const { store, operatorActions, runs } = makeStore();
    const harness = makeHarness(store);
    await harness.manager.start();

    expect(
      harness.manager.requestOperatorStart(EVENT.id, "operator-1", 1_000),
    ).toBe("started");
    expect(
      harness.manager.requestOperatorStart("nope", "operator-1", 1_000),
    ).toBe("unknown-event");
    await nextTurn();

    expect(operatorActions).toEqual([
      { action: "start", accepted: true },
      { action: "start", accepted: false },
    ]);
    expect(runs.size).toBe(1);
    await harness.manager.stop();
  });

  it("does nothing at all without a durable store", async () => {
    const harness = makeHarness();
    await harness.manager.start();
    harness.manager.tick(1_000);
    harness.manager.tick(60_000);

    expect(harness.manager.activeEventIds).toEqual([]);
    expect(harness.spawned).toEqual([]);
    expect(
      harness.manager.requestOperatorStart(EVENT.id, "operator-1", 1_000),
    ).toBe("unavailable");
  });
  it("never hands a raid spawn a protection-zone tile, even when the area is mostly town", async () => {
    // Thais' rat raid area spans the whole town, so most random picks land
    // in the temple or depot. Canary's Tile::queryAdd refuses a monster on a
    // protection zone (tile.cpp); the event manager must pick around it
    // instead of handing those tiles to the spawner.
    const { store } = makeStore();
    const plague: WorldEventDefinition = {
      ...EVENT,
      stages: [
        { kind: "spawn", monsters: [{ name: "Rat", amount: 40 }], advanceAfterMs: 10 },
      ],
    };
    const harness = makeHarness(store, {
      events: new Map([[plague.id, plague]]),
      protectionZones: TOWN_PROTECTION_ZONE,
    });
    await harness.manager.start();
    harness.manager.tick(1_000);
    await nextTurn();
    for (let now = 1_010; now <= 1_200; now += 10) harness.manager.tick(now);

    expect(harness.spawned).toHaveLength(40);
    const inTown = harness.spawned.filter((spawn) =>
      harness.world.isProtectionZone(spawn.position),
    );
    expect(inTown).toEqual([]);
    for (const spawn of harness.spawned) {
      expect(spawn.position.x).toBeGreaterThanOrEqual(7);
      expect(spawn.position.x).toBeLessThanOrEqual(8);
    }
    await harness.manager.stop();
  });

  it("places every raid monster outside the protection zone through the real spawner", async () => {
    // End to end, wired the way GameServer wires it: the event manager picks
    // the tile and SpawnManager.spawnEventMonsterNear places the creature.
    // No live monster may stand in the zone, and the plague must still reach
    // its full head count — the zone is avoided, not silently dropped.
    const { store } = makeStore();
    const rat = makeMonsterType({ id: "rat", name: "Rat" });
    const plague: WorldEventDefinition = {
      ...EVENT,
      stages: [
        { kind: "spawn", monsters: [{ name: "Rat", amount: 8 }], advanceAfterMs: 10 },
      ],
    };
    let spawns: SpawnManager | undefined;
    const harness = makeHarness(store, {
      events: new Map([[plague.id, plague]]),
      protectionZones: TOWN_PROTECTION_ZONE,
      spawnMonster: (_world, _name, position, now) =>
        spawns?.spawnEventMonsterNear(rat.id, position, now) !== null,
    });
    const visibility = {
      announceCreatureSpawn: () => undefined,
      announceCreatureLeave: () => undefined,
      onCreatureStepped: () => undefined,
      broadcastPose: () => undefined,
      broadcastCreatureSpeech: () => undefined,
    } as unknown as Visibility;
    spawns = new SpawnManager(
      harness.world,
      visibility,
      {
        monsterTypes: new Map([[rat.id, rat]]),
        npcTypes: new Map(),
        shopCatalogs: new Map(),
        slots: [],
      },
      {
        activationRange: { x: 10, y: 10 },
        retryMs: 100,
        maxSpawnChecksPerTick: 32,
        maxSpawnAttemptsPerTick: 8,
        maxAiScansPerTick: 32,
        maxAiWorkPerTick: 32,
        ai: {
          thinkIntervalMs: 250,
          acquisitionRange: 8,
          loseRange: 12,
          despawnRadius: 50,
          maxPathNodes: 16,
          wanderChance: 0,
          seed: 123,
        },
      },
    );
    await harness.manager.start();
    harness.manager.tick(1_000);
    await nextTurn();
    for (let now = 1_010; now <= 1_100; now += 10) harness.manager.tick(now);

    const monsters = [...harness.world.allCreatures()].filter(
      (creature) => creature.kind === "monster",
    );
    expect(monsters).toHaveLength(8);
    expect(
      monsters.filter((monster) => harness.world.isProtectionZone(monster.position)),
    ).toEqual([]);
    await harness.manager.stop();
  });
});
