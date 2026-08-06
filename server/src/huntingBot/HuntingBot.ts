import {
  HUNTING_BOT_LIMITS,
  type HuntingBotStopReason,
  type Position,
} from "@tibia/protocol";
import type { MovementHandler } from "../MovementHandler";
import type { Session } from "../Session";
import type { World } from "../World";

/**
 * Walks a character around a saved waypoint ring, forever, and gets out of
 * the way whenever there is something to kill.
 *
 * The bot owns no movement of its own: it decides *where* the character
 * should head next and hands that destination to the movement system, which
 * computes the route and re-validates every single step at execution time
 * (charter rules 1, 4, 5). Targeting is likewise the combat system's job —
 * this only clears the walk queue while a target is alive so the chase and
 * the route never fight over the same character.
 */
export class HuntingBot {
  constructor(
    private readonly world: World,
    private readonly movement: MovementHandler,
  ) {}

  /**
   * Arms the bot at the waypoint nearest the character, proving the joining
   * walk exists before promising it: the distance gate alone cannot tell
   * "in the hunt" from "next to it but walled off". The two refusals name
   * what the player actually got wrong from the window — standing on the
   * wrong floor, or too far from anything the bot can walk to.
   */
  start(session: Session, now: number): "ok" | "wrong-floor" | "out-of-range" {
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    if (!player) return "out-of-range";
    const waypoints = session.huntingBotRoute.waypoints;
    if (
      waypoints.length > 0 &&
      !waypoints.some((waypoint) => waypoint.z === player.position.z)
    ) {
      return "wrong-floor";
    }
    const index = nearestWaypointIndex(player.position, waypoints);
    if (index === null) return "out-of-range";
    const waypoint = waypoints[index];
    if (!waypoint) return "out-of-range";
    if (
      !samePosition(player.position, waypoint) &&
      !this.movement.walkPathTo(
        session,
        player,
        waypoint,
        HUNTING_BOT_LIMITS.maxStartVisited,
        now,
      )
    ) {
      return "out-of-range";
    }
    session.huntingBotEnabled = true;
    session.huntingBotWaypointIndex = index;
    session.huntingBotSkips = 0;
    session.huntingBotPathFailures = 0;
    session.huntingBotRepathReadyAt = 0;
    this.sendStatus(session, null);
    return "ok";
  }

  stop(session: Session, reason: HuntingBotStopReason | null): void {
    if (!session.huntingBotEnabled) return;
    session.huntingBotEnabled = false;
    session.autoWalkDirections = [];
    this.sendStatus(session, reason);
  }

  tick(session: Session, now: number): void {
    if (!session.huntingBotEnabled) return;
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    if (!player) return;
    if (player.health <= 0) {
      this.stop(session, "died");
      return;
    }
    const waypoints = session.huntingBotRoute.waypoints;
    if (waypoints.length === 0) {
      this.stop(session, "no-route");
      return;
    }
    // Something is being fought: stand down and let the attack pipeline own
    // the character's feet until the target is gone.
    const target = session.attackTargetId
      ? this.world.getCreature(session.attackTargetId)
      : undefined;
    if (target && target.health > 0) {
      if (session.autoWalkDirections.length > 0) {
        session.autoWalkDirections = [];
      }
      return;
    }
    // A leg is still being walked; the movement tick is draining it.
    if (session.autoWalkDirections.length > 0) return;
    if (now < session.huntingBotRepathReadyAt) return;
    session.huntingBotRepathReadyAt = now + HUNTING_BOT_LIMITS.repathCooldownMs;

    if (session.huntingBotWaypointIndex >= waypoints.length) {
      session.huntingBotWaypointIndex = 0;
    }
    let waypoint = waypoints[session.huntingBotWaypointIndex];
    if (!waypoint) return;
    // One saved route covers a cave's several floors, and the bot cannot use
    // a ladder: it walks the ring on the floor the character is standing on
    // and steps over the rest, in the same tick so no walking time is lost.
    // Climb down yourself and the ring below picks up. A floor with no
    // waypoints at all falls through to the path failure below, which stops
    // the bot the way it always did.
    if (waypoint.z !== player.position.z) {
      const next = nextIndexOnFloor(
        waypoints,
        session.huntingBotWaypointIndex,
        player.position.z,
      );
      const onFloor = next === null ? undefined : waypoints[next];
      if (next !== null && onFloor) {
        session.huntingBotSkips = 0;
        session.huntingBotPathFailures = 0;
        session.huntingBotWaypointIndex = next;
        waypoint = onFloor;
        this.sendStatus(session, null);
      }
    }
    if (samePosition(player.position, waypoint)) {
      session.huntingBotSkips = 0;
      session.huntingBotPathFailures = 0;
      this.advance(session, waypoints.length);
      return;
    }
    const walking = this.movement.walkPathTo(
      session,
      player,
      waypoint,
      HUNTING_BOT_LIMITS.maxRuntimeVisited,
      now,
    );
    if (walking) {
      session.huntingBotSkips = 0;
      session.huntingBotPathFailures = 0;
      return;
    }
    // A creature is standing on the goal. Waiting five repaths for it to move
    // is wasted time when it never will — guide waypoints sit on spawn tiles,
    // and plenty of creatures hold theirs — so the ring moves on at once. The
    // skip still counts, so a route blocked end to end stops the bot.
    if (this.world.isOccupied(waypoint)) {
      session.huntingBotPathFailures = 0;
      session.huntingBotSkips++;
      if (session.huntingBotSkips >= HUNTING_BOT_LIMITS.maxConsecutiveSkips) {
        this.stop(session, "unreachable");
        return;
      }
      this.advance(session, waypoints.length);
      return;
    }
    // No route right now — a closed door, a creature in the corridor, or a
    // waypoint hand-placed somewhere unreachable. Wait and retry the same
    // waypoint first: advancing on one failure spins the ring far faster than
    // the character walks. Only a waypoint that stays unreachable is skipped,
    // and a whole run of those stops the bot.
    session.huntingBotPathFailures++;
    if (
      session.huntingBotPathFailures < HUNTING_BOT_LIMITS.skipAfterFailedRepaths
    ) {
      return;
    }
    session.huntingBotPathFailures = 0;
    session.huntingBotSkips++;
    if (session.huntingBotSkips >= HUNTING_BOT_LIMITS.maxConsecutiveSkips) {
      this.stop(session, "unreachable");
      return;
    }
    this.advance(session, waypoints.length);
  }

  private advance(session: Session, length: number): void {
    session.huntingBotWaypointIndex =
      (session.huntingBotWaypointIndex + 1) % length;
    this.sendStatus(session, null);
  }

  private sendStatus(
    session: Session,
    stopReason: HuntingBotStopReason | null,
  ): void {
    session.send({
      type: "hunting-bot-status",
      enabled: session.huntingBotEnabled,
      waypointIndex: session.huntingBotWaypointIndex,
      stopReason,
    });
  }
}

function samePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

/**
 * The next waypoint on `floor`, searching forward from `from` and wrapping,
 * so the ring keeps its walking order instead of jumping to whichever one
 * happens to be nearest. Null when the floor holds none.
 */
function nextIndexOnFloor(
  waypoints: ReadonlyArray<Position>,
  from: number,
  floor: number,
): number | null {
  for (let step = 0; step < waypoints.length; step++) {
    const index = (from + step) % waypoints.length;
    if (waypoints[index]?.z === floor) return index;
  }
  return null;
}

/**
 * Where in the ring the character joins. Only waypoints on the character's
 * own floor and within reach count, so arming the bot from the depot cannot
 * start a cross-map hike. Ties go to the earliest index: routes revisit
 * tiles (closed loops, out-and-back corridors), and joining at the earliest
 * copy makes the bot continue forward through the hunt rather than arm at
 * the return leg and head straight for the end.
 */
function nearestWaypointIndex(
  position: Position,
  waypoints: ReadonlyArray<Position>,
): number | null {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  waypoints.forEach((waypoint, index) => {
    if (waypoint.z !== position.z) return;
    const distance = Math.max(
      Math.abs(waypoint.x - position.x),
      Math.abs(waypoint.y - position.y),
    );
    if (distance > HUNTING_BOT_LIMITS.maxStartDistance) return;
    if (distance >= bestDistance) return;
    best = index;
    bestDistance = distance;
  });
  return best;
}
