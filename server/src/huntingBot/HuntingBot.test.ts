import { describe, expect, it } from "vitest";
import type { Position, ServerMessage } from "@tibia/protocol";
import type { Creature } from "../creature/Creature";
import type { MovementHandler } from "../MovementHandler";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import { HuntingBot } from "./HuntingBot";

const RING: ReadonlyArray<Position> = [
  { x: 10, y: 10, z: 7 },
  { x: 14, y: 10, z: 7 },
  { x: 14, y: 14, z: 7 },
];

function makeWorld(
  player: { id: string; position: Position; health: number } | null,
  target?: Creature,
) {
  return {
    getPlayer: (id: string) => (id === "char-1" ? player ?? undefined : undefined),
    getCreature: (id: string) => (target?.id === id ? target : undefined),
  } as unknown as World;
}

/** Mutable stand-in: tests move the character between ticks. */
function makePlayer(position: Position, health = 100) {
  return { id: "char-1", position, health } as { id: string; position: Position; health: number };
}

function makeSession(waypoints: ReadonlyArray<Position> = RING) {
  const sent: ServerMessage[] = [];
  const session = {
    playerId: "char-1",
    huntingBotEnabled: false,
    huntingBotRoute: { huntName: "Test", waypoints: [...waypoints] },
    huntingBotWaypointIndex: 0,
    huntingBotRepathReadyAt: 0,
    huntingBotSkips: 0,
    huntingBotPathFailures: 0,
    autoWalkDirections: [] as string[],
    attackTargetId: null as string | null,
    send: (message: ServerMessage) => sent.push(message),
  } as unknown as Session;
  return { session, sent };
}

/** Records every destination the bot asks the movement system to walk to. */
function makeMovement(accept: (target: Position) => boolean = () => true) {
  const requests: Position[] = [];
  const movement = {
    walkPathTo: (
      session: Session,
      _player: Player,
      target: Position,
    ): boolean => {
      requests.push(target);
      if (!accept(target)) return false;
      session.autoWalkDirections = ["north"];
      return true;
    },
  } as unknown as MovementHandler;
  return { movement, requests };
}

describe("HuntingBot", () => {
  it("starts at the waypoint nearest the character", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 14, y: 13, z: 7 });
    const bot = new HuntingBot(makeWorld(player), makeMovement().movement);

    expect(bot.start(session, 0)).toBe("ok");
    expect(session.huntingBotEnabled).toBe(true);
    expect(session.huntingBotWaypointIndex).toBe(2);
  });

  it("refuses to arm when nothing walkable reaches the route", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 14, y: 13, z: 7 });
    const bot = new HuntingBot(
      makeWorld(player),
      makeMovement(() => false).movement,
    );

    expect(bot.start(session, 0)).toBe("out-of-range");
    expect(session.huntingBotEnabled).toBe(false);
  });

  it("joins at the earliest copy of a revisited tile and continues forward", () => {
    // An out-and-back corridor: the way home walks the same tiles in
    // reverse, so the tile of waypoint 1 appears again as waypoint 3.
    const { session } = makeSession([
      { x: 10, y: 10, z: 7 },
      { x: 12, y: 10, z: 7 },
      { x: 14, y: 10, z: 7 },
      { x: 12, y: 10, z: 7 },
    ]);
    const player = makePlayer({ x: 12, y: 11, z: 7 });
    const bot = new HuntingBot(makeWorld(player), makeMovement().movement);

    expect(bot.start(session, 0)).toBe("ok");
    expect(session.huntingBotWaypointIndex).toBe(1);
  });

  it("refuses to start when the character is not in the hunt", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 4_000, y: 4_000, z: 7 });
    const bot = new HuntingBot(makeWorld(player), makeMovement().movement);

    expect(bot.start(session, 0)).toBe("out-of-range");
    expect(session.huntingBotEnabled).toBe(false);
  });

  it("refuses to start on a floor the route does not visit", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 10, y: 10, z: 6 });
    const bot = new HuntingBot(makeWorld(player), makeMovement().movement);

    expect(bot.start(session, 0)).toBe("wrong-floor");
  });

  it("walks to the current waypoint and loops around the ring", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 10, y: 10, z: 7 });
    const { movement, requests } = makeMovement();
    const bot = new HuntingBot(makeWorld(player), movement);
    bot.start(session, 0);

    // Standing on waypoint 0 advances to 1 and asks to walk there.
    bot.tick(session, 1_000);
    expect(session.huntingBotWaypointIndex).toBe(1);
    bot.tick(session, 2_000);
    expect(requests).toEqual([{ x: 14, y: 10, z: 7 }]);

    // Arriving empties the walk queue; the next tick advances again.
    session.autoWalkDirections = [];
    player.position = { x: 14, y: 10, z: 7 };
    bot.tick(session, 3_000);
    expect(session.huntingBotWaypointIndex).toBe(2);

    session.huntingBotWaypointIndex = 2;
    player.position = { x: 14, y: 14, z: 7 };
    bot.tick(session, 4_000);
    expect(session.huntingBotWaypointIndex).toBe(0);
  });

  it("stands down while a target is alive and drops the queued walk", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 12, y: 10, z: 7 });
    const target = { id: "rat-1", health: 40 } as unknown as Creature;
    const { movement, requests } = makeMovement();
    const bot = new HuntingBot(makeWorld(player, target), movement);
    bot.start(session, 0);
    requests.length = 0;
    session.attackTargetId = "rat-1";
    session.autoWalkDirections = ["north", "north"];

    bot.tick(session, 1_000);

    expect(session.autoWalkDirections).toEqual([]);
    expect(requests).toEqual([]);
  });

  it("resumes walking once the target is dead", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 12, y: 10, z: 7 });
    const target = { id: "rat-1", health: 0 } as unknown as Creature;
    const { movement, requests } = makeMovement();
    const bot = new HuntingBot(makeWorld(player, target), movement);
    bot.start(session, 0);
    // The join walk was dropped during the fight; nothing is queued now.
    requests.length = 0;
    session.autoWalkDirections = [];
    session.attackTargetId = "rat-1";

    bot.tick(session, 1_000);

    expect(requests.length).toBe(1);
  });

  it("waits and retries a waypoint it cannot path to before skipping it", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 12, y: 10, z: 7 });
    const { movement, requests } = makeMovement(
      (target) => target.x !== 14 || target.y !== 10,
    );
    const bot = new HuntingBot(makeWorld(player), movement);
    bot.start(session, 0);
    requests.length = 0;
    session.autoWalkDirections = [];
    session.huntingBotWaypointIndex = 1;

    // Every failed search short of the retry budget stays on the waypoint.
    for (let attempt = 1; attempt < 5; attempt++) {
      session.huntingBotRepathReadyAt = 0;
      bot.tick(session, attempt * 1_000);
      expect(session.huntingBotWaypointIndex).toBe(1);
    }

    // The retry that exhausts the budget finally skips ahead.
    session.huntingBotRepathReadyAt = 0;
    bot.tick(session, 5_000);

    expect(requests).toEqual(Array(5).fill({ x: 14, y: 10, z: 7 }));
    expect(session.huntingBotWaypointIndex).toBe(2);
    expect(session.huntingBotEnabled).toBe(true);
  });

  it("a successful walk resets the retry budget of the next waypoint", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 12, y: 10, z: 7 });
    const { movement } = makeMovement(
      (target) => target.x !== 14 || target.y !== 10,
    );
    const bot = new HuntingBot(makeWorld(player), movement);
    bot.start(session, 0);
    session.autoWalkDirections = [];
    session.huntingBotWaypointIndex = 1;
    session.huntingBotPathFailures = 4;

    // One more failure would skip — but walking to it succeeds elsewhere
    // first, so the counter starts over.
    session.huntingBotWaypointIndex = 0;
    session.huntingBotRepathReadyAt = 0;
    bot.tick(session, 1_000);

    expect(session.huntingBotPathFailures).toBe(0);
  });

  it("stops itself once a whole run of waypoints is unreachable", () => {
    const { session, sent } = makeSession();
    // Armed while standing on a waypoint, then displaced somewhere the
    // route can no longer be pathed from — a door closed behind a lure.
    const player = makePlayer({ x: 10, y: 10, z: 7 });
    const { movement } = makeMovement(() => false);
    const bot = new HuntingBot(makeWorld(player), movement);
    bot.start(session, 0);
    player.position = { x: 11, y: 11, z: 7 };

    // Each waypoint absorbs its retry budget before it is skipped, so a
    // whole unreachable ring takes skips-times-retries failed searches.
    for (let tick = 0; tick < 45; tick++) {
      session.huntingBotRepathReadyAt = 0;
      bot.tick(session, tick * 1_000);
    }

    expect(session.huntingBotEnabled).toBe(false);
    expect(sent.at(-1)).toMatchObject({
      type: "hunting-bot-status",
      enabled: false,
      stopReason: "unreachable",
    });
  });

  it("stops when the character dies", () => {
    const { session, sent } = makeSession();
    const player = makePlayer({ x: 10, y: 10, z: 7 }, 0);
    const bot = new HuntingBot(makeWorld(player), makeMovement().movement);
    session.huntingBotEnabled = true;

    bot.tick(session, 1_000);

    expect(session.huntingBotEnabled).toBe(false);
    expect(sent.at(-1)).toMatchObject({ stopReason: "died" });
  });

  it("does nothing at all while disabled", () => {
    const { session, sent } = makeSession();
    const player = makePlayer({ x: 10, y: 10, z: 7 });
    const { movement, requests } = makeMovement();
    const bot = new HuntingBot(makeWorld(player), movement);

    bot.tick(session, 1_000);

    expect(requests).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("paces its path searches with the repath cooldown", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 10, y: 10, z: 7 });
    const { movement, requests } = makeMovement(() => false);
    const bot = new HuntingBot(makeWorld(player), movement);
    bot.start(session, 0);
    player.position = { x: 12, y: 11, z: 7 };

    bot.tick(session, 1_000);
    bot.tick(session, 1_100);
    bot.tick(session, 1_200);

    expect(requests.length).toBe(1);
  });

  it("walks the ring on the floor the character is standing on", () => {
    // One cave, two floors: a saved route holds both rings back to back.
    const { session } = makeSession([
      { x: 10, y: 10, z: 8 },
      { x: 14, y: 10, z: 8 },
      { x: 30, y: 30, z: 9 },
      { x: 34, y: 30, z: 9 },
    ]);
    const player = makePlayer({ x: 30, y: 31, z: 9 });
    const { movement, requests } = makeMovement();
    const bot = new HuntingBot(makeWorld(player), movement);

    expect(bot.start(session, 0)).toBe("ok");
    expect(session.huntingBotWaypointIndex).toBe(2);

    // Reaching one waypoint advances to the next on the same floor, and the
    // ring wraps back to that floor's own start rather than the route's.
    player.position = { x: 34, y: 30, z: 9 };
    session.huntingBotWaypointIndex = 3;
    session.autoWalkDirections = [];
    bot.tick(session, 1_000);
    session.autoWalkDirections = [];
    bot.tick(session, 2_000);

    expect(session.huntingBotWaypointIndex).toBe(2);
    expect(requests.every((target) => target.z === 9)).toBe(true);
  });

  it("picks up the other floor's ring after the character climbs down", () => {
    const { session } = makeSession([
      { x: 10, y: 10, z: 8 },
      { x: 14, y: 10, z: 8 },
      { x: 30, y: 30, z: 9 },
      { x: 34, y: 30, z: 9 },
    ]);
    const player = makePlayer({ x: 10, y: 11, z: 8 });
    const { movement, requests } = makeMovement();
    const bot = new HuntingBot(makeWorld(player), movement);

    expect(bot.start(session, 0)).toBe("ok");
    player.position = { x: 30, y: 31, z: 9 };
    session.autoWalkDirections = [];
    bot.tick(session, 1_000);

    expect(session.huntingBotWaypointIndex).toBe(2);
    expect(requests.at(-1)?.z).toBe(9);
  });

  it("stops on a floor the route never visits, as it always did", () => {
    const { session } = makeSession([
      { x: 10, y: 10, z: 8 },
      { x: 14, y: 10, z: 8 },
    ]);
    const player = makePlayer({ x: 10, y: 11, z: 8 });
    const bot = new HuntingBot(
      makeWorld(player),
      makeMovement(() => false).movement,
    );
    session.huntingBotEnabled = true;

    player.position = { x: 10, y: 11, z: 5 };
    for (let tick = 1; tick <= 60 && session.huntingBotEnabled; tick++) {
      session.huntingBotRepathReadyAt = 0;
      bot.tick(session, tick * 1_000);
    }

    expect(session.huntingBotEnabled).toBe(false);
  });
});
