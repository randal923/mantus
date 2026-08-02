import { describe, expect, it } from "vitest";
import {
  DEFAULT_HUNTING_BOT_ROUTE,
  HUNTING_BOT_LIMITS,
  type Position,
  type ServerMessage,
} from "@tibia/protocol";
import type { CharacterStore } from "../character/CharacterStore";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { InMemoryCharacterStore } from "../test/InMemoryCharacterStore";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { HuntingBot } from "./HuntingBot";
import { HuntingBotHandler } from "./HuntingBotHandler";

const RING: ReadonlyArray<Position> = [
  { x: 10, y: 10, z: 7 },
  { x: 12, y: 10, z: 7 },
];

function makeWorld(
  map = gridMapData({ name: "test", width: 40, height: 40, blocked: [] }),
  playerAt: Position = { x: 11, y: 10, z: 7 },
) {
  const world = new World(map, 180);
  world.addPlayer(new Player(makeCharacter("char-1", "Tester"), playerAt));
  return world;
}

function makeBot(world: World) {
  const movement = {
    walkPathTo: () => true,
  } as unknown as ConstructorParameters<typeof HuntingBot>[1];
  return new HuntingBot(world, movement);
}

function makeHandler(store: CharacterStore, world = makeWorld()) {
  const sessions: Session[] = [];
  const registry = {
    contains: () => true,
    all: () => sessions,
  } as unknown as SessionRegistry;
  const bot = makeBot(world);
  return {
    handler: new HuntingBotHandler(registry, world, store, bot),
    world,
    sessions,
  };
}

function makeSession(playerId: string | null) {
  const sent: ServerMessage[] = [];
  const errors: string[] = [];
  const session = {
    playerId,
    huntingBotRouteUpdatePending: false,
    huntingBotTracePending: false,
    huntingBotTraceReadyAt: 0,
    huntingBotRoute: { ...DEFAULT_HUNTING_BOT_ROUTE, waypoints: [] },
    huntingBotEnabled: false,
    huntingBotWaypointIndex: 0,
    huntingBotRepathReadyAt: 0,
    huntingBotSkips: 0,
    autoWalkDirections: [],
    attackTargetId: null,
    send: (message: ServerMessage) => sent.push(message),
    sendError: (code: string) => errors.push(code),
  } as unknown as Session;
  return { session, sent, errors };
}

function seededStore() {
  const store = new InMemoryCharacterStore();
  store.seed(makeCharacter("char-1"));
  return store;
}

async function settle(handler: HuntingBotHandler, now = 0) {
  await new Promise((resolve) => setImmediate(resolve));
  handler.applyResolvedOutcomes(now);
}

async function settleTrace(handler: HuntingBotHandler, legs: number, now = 0) {
  for (let index = 0; index <= legs + 2; index++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  handler.applyResolvedOutcomes(now);
}

describe("HuntingBotHandler", () => {
  it("rejects every intent from a session without a joined character", () => {
    const { session, errors } = makeSession(null);
    const { handler } = makeHandler(seededStore());

    handler.handle(
      session,
      { type: "set-hunting-bot-enabled", enabled: true },
      0,
    );

    expect(errors).toEqual(["join-required"]);
    expect(session.huntingBotEnabled).toBe(false);
  });

  it("persists a saved route and echoes it back", async () => {
    const { session, sent } = makeSession("char-1");
    const store = seededStore();
    const { handler } = makeHandler(store);

    handler.handle(
      session,
      {
        type: "update-hunting-bot-route",
        route: { huntName: "  Rotworms  ", waypoints: [...RING] },
      },
      0,
    );
    await settle(handler);

    expect(session.huntingBotRoute.huntName).toBe("Rotworms");
    expect(store.get("char-1")?.huntingBotRoute.waypoints).toEqual(RING);
    expect(sent.at(-1)).toMatchObject({ type: "hunting-bot-route" });
  });

  it("applies the newest route after the in-flight write settles, never refusing it", async () => {
    const { session, errors } = makeSession("char-1");
    const store = seededStore();
    const { handler, sessions } = makeHandler(store);
    sessions.push(session);

    handler.handle(
      session,
      {
        type: "update-hunting-bot-route",
        route: { huntName: "A", waypoints: [...RING] },
      },
      0,
    );
    handler.handle(
      session,
      {
        type: "update-hunting-bot-route",
        route: { huntName: "B", waypoints: [...RING] },
      },
      0,
    );

    expect(errors).toEqual([]);
    await settle(handler); // write A lands, deferred B starts
    await settle(handler); // write B lands

    expect(session.huntingBotRoute.huntName).toBe("B");
    expect(store.get("char-1")?.huntingBotRoute.huntName).toBe("B");
  });

  it("answers a trace sent during the cooldown once the cooldown ends", async () => {
    const { session, sent } = makeSession("char-1");
    const { handler, sessions } = makeHandler(seededStore());
    sessions.push(session);
    const traced = () =>
      sent.filter((message) => message.type === "hunting-bot-traced").length;

    handler.handle(session, { type: "hunting-bot-trace", points: [...RING] }, 0);
    await settleTrace(handler, RING.length);
    expect(traced()).toBe(1);

    // Inside the cooldown the request is held, not dropped...
    handler.handle(session, { type: "hunting-bot-trace", points: [...RING] }, 500);
    handler.applyResolvedOutcomes(1_000);
    expect(traced()).toBe(1);

    // ...and starts by itself the moment the cooldown expires.
    handler.applyResolvedOutcomes(2_000);
    await settleTrace(handler, RING.length, 2_000);
    expect(traced()).toBe(2);
  });

  it("rolls the session route back when the durable write fails", async () => {
    const { session, errors } = makeSession("char-1");
    const failing = {
      updateHuntingBotRoute: () => Promise.reject(new Error("db down")),
    } as unknown as CharacterStore;
    const { handler } = makeHandler(failing);

    handler.handle(
      session,
      {
        type: "update-hunting-bot-route",
        route: { huntName: "A", waypoints: [...RING] },
      },
      0,
    );
    expect(session.huntingBotRoute.waypoints).toEqual(RING);
    await settle(handler);

    expect(session.huntingBotRoute.waypoints).toEqual([]);
    expect(errors).toEqual(["hunting-bot-update-failed"]);
  });

  it("drops consecutive duplicate waypoints so the bot cannot spin", async () => {
    const { session } = makeSession("char-1");
    const { handler } = makeHandler(seededStore());

    handler.handle(
      session,
      {
        type: "update-hunting-bot-route",
        route: {
          huntName: "A",
          waypoints: [RING[0]!, RING[0]!, RING[1]!, RING[1]!],
        },
      },
      0,
    );
    await settle(handler);

    expect(session.huntingBotRoute.waypoints).toEqual(RING);
  });

  it("refuses to arm an empty route", () => {
    const { session, errors } = makeSession("char-1");
    const { handler } = makeHandler(seededStore());

    handler.handle(
      session,
      { type: "set-hunting-bot-enabled", enabled: true },
      0,
    );

    expect(errors).toEqual(["hunting-bot-invalid"]);
  });

  it("refuses to arm from outside the hunt", () => {
    const { session, errors } = makeSession("char-1");
    const world = makeWorld(
      gridMapData({ name: "test", width: 400, height: 400, blocked: [] }),
      { x: 300, y: 300, z: 7 },
    );
    const { handler } = makeHandler(seededStore(), world);
    session.huntingBotRoute = { huntName: "A", waypoints: [...RING] };

    handler.handle(
      session,
      { type: "set-hunting-bot-enabled", enabled: true },
      0,
    );

    expect(errors).toEqual(["hunting-bot-out-of-range"]);
    expect(session.huntingBotEnabled).toBe(false);
  });

  it("names the floor as the problem when the route is above or below", () => {
    const { session, errors } = makeSession("char-1");
    const world = makeWorld(
      gridMapData({ name: "test", width: 40, height: 40, blocked: [], floors: [6, 7] }),
      { x: 11, y: 10, z: 6 },
    );
    const { handler } = makeHandler(seededStore(), world);
    session.huntingBotRoute = { huntName: "A", waypoints: [...RING] };

    handler.handle(
      session,
      { type: "set-hunting-bot-enabled", enabled: true },
      0,
    );

    expect(errors).toEqual(["hunting-bot-wrong-floor"]);
    expect(session.huntingBotEnabled).toBe(false);
  });

  it("traces a guide route into a walkable chain", async () => {
    const world = makeWorld(
      gridMapData({
        name: "test",
        width: 40,
        height: 40,
        // A wall the guide's straight line runs right through.
        blocked: Array.from({ length: 9 }, (_, y) => [15, y] as const),
      }),
      { x: 10, y: 2, z: 7 },
    );
    const { session, sent } = makeSession("char-1");
    const { handler } = makeHandler(seededStore(), world);

    handler.handle(
      session,
      {
        type: "hunting-bot-trace",
        points: [
          { x: 10, y: 2, z: 7 },
          { x: 20, y: 2, z: 7 },
        ],
      },
      0,
    );
    await settleTrace(handler, 4);

    const traced = sent.at(-1);
    expect(traced).toMatchObject({ type: "hunting-bot-traced" });
    const waypoints = (traced as { waypoints: Position[] }).waypoints;
    expect(waypoints.at(-1)).toEqual({ x: 20, y: 2, z: 7 });
    for (const waypoint of waypoints) {
      expect(world.isWalkable(waypoint)).toBe(true);
    }
    expect(session.huntingBotTracePending).toBe(false);
  });

  it("throttles trace requests and refuses a concurrent one", () => {
    const { session } = makeSession("char-1");
    const { handler } = makeHandler(seededStore());
    const intent = {
      type: "hunting-bot-trace" as const,
      points: [
        { x: 10, y: 10, z: 7 },
        { x: 12, y: 10, z: 7 },
      ],
    };

    handler.handle(session, intent, 0);
    expect(session.huntingBotTracePending).toBe(true);
    expect(session.huntingBotTraceReadyAt).toBe(
      HUNTING_BOT_LIMITS.traceCooldownMs,
    );

    session.huntingBotTracePending = false;
    handler.handle(session, intent, 100);
    // Still inside the cooldown, so nothing new was started.
    expect(session.huntingBotTracePending).toBe(false);
  });
});
