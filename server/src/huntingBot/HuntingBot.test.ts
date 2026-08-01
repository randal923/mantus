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

    expect(bot.start(session)).toBe(true);
    expect(session.huntingBotEnabled).toBe(true);
    expect(session.huntingBotWaypointIndex).toBe(2);
  });

  it("refuses to start when the character is not in the hunt", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 4_000, y: 4_000, z: 7 });
    const bot = new HuntingBot(makeWorld(player), makeMovement().movement);

    expect(bot.start(session)).toBe(false);
    expect(session.huntingBotEnabled).toBe(false);
  });

  it("refuses to start on a floor the route does not visit", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 10, y: 10, z: 6 });
    const bot = new HuntingBot(makeWorld(player), makeMovement().movement);

    expect(bot.start(session)).toBe(false);
  });

  it("walks to the current waypoint and loops around the ring", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 10, y: 10, z: 7 });
    const { movement, requests } = makeMovement();
    const bot = new HuntingBot(makeWorld(player), movement);
    bot.start(session);

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
    bot.start(session);
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
    bot.start(session);
    session.attackTargetId = "rat-1";

    bot.tick(session, 1_000);

    expect(requests.length).toBe(1);
  });

  it("skips a waypoint nothing can path to rather than freezing on it", () => {
    const { session } = makeSession();
    const player = makePlayer({ x: 12, y: 10, z: 7 });
    const { movement, requests } = makeMovement(
      (target) => target.x !== 14 || target.y !== 10,
    );
    const bot = new HuntingBot(makeWorld(player), movement);
    bot.start(session);
    session.huntingBotWaypointIndex = 1;

    bot.tick(session, 1_000);

    expect(requests).toEqual([{ x: 14, y: 10, z: 7 }]);
    expect(session.huntingBotWaypointIndex).toBe(2);
    expect(session.huntingBotEnabled).toBe(true);
  });

  it("stops itself once a whole run of waypoints is unreachable", () => {
    const { session, sent } = makeSession();
    const player = makePlayer({ x: 12, y: 10, z: 7 });
    const { movement } = makeMovement(() => false);
    const bot = new HuntingBot(makeWorld(player), movement);
    bot.start(session);

    for (let tick = 0; tick < 20; tick++) {
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
    const player = makePlayer({ x: 12, y: 10, z: 7 });
    const { movement, requests } = makeMovement(() => false);
    const bot = new HuntingBot(makeWorld(player), movement);
    bot.start(session);

    bot.tick(session, 1_000);
    bot.tick(session, 1_100);
    bot.tick(session, 1_200);

    expect(requests.length).toBe(1);
  });
});
