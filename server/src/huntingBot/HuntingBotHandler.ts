import {
  HUNTING_BOT_LIMITS,
  type HuntingBotRoute,
  type HuntingBotTraceMessage,
  type Position,
  type SetHuntingBotEnabledMessage,
  type UpdateHuntingBotRouteMessage,
} from "@tibia/protocol";
import type { CharacterStore } from "../character/CharacterStore";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { buildRouteAnchors } from "./buildRouteAnchors";
import type { HuntingBot } from "./HuntingBot";
import { traceRouteLeg } from "./traceRouteLeg";

export type HuntingBotIntent =
  | UpdateHuntingBotRouteMessage
  | SetHuntingBotEnabledMessage
  | HuntingBotTraceMessage;

/**
 * Owns the character's saved hunting route and the one-shot route tracing the
 * window asks for.
 *
 * The route itself is inert data — a list of tiles the character would like
 * to visit. Nothing about it is trusted as movement: `HuntingBot` hands each
 * waypoint to the movement system as a *destination*, and the server computes
 * and re-validates the walk. A hand-edited waypoint in the middle of a wall
 * therefore costs the player a skipped waypoint, never a teleport.
 */
export class HuntingBotHandler {
  private readonly outcomes: Array<() => void> = [];

  constructor(
    private readonly registry: SessionRegistry,
    private readonly world: World,
    private readonly characters: CharacterStore,
    private readonly bot: HuntingBot,
  ) {}

  handle(session: Session, intent: HuntingBotIntent, now: number): void {
    const playerId = session.playerId;
    if (!playerId || !this.world.getPlayer(playerId)) {
      session.sendError("join-required");
      return;
    }
    if (intent.type === "update-hunting-bot-route") {
      this.handleRoute(session, playerId, intent, now);
      return;
    }
    if (intent.type === "set-hunting-bot-enabled") {
      this.handleEnabled(session, intent, now);
      return;
    }
    this.handleTrace(session, intent, now);
  }

  applyResolvedOutcomes(): void {
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  private handleRoute(
    session: Session,
    characterId: string,
    intent: UpdateHuntingBotRouteMessage,
    now: number,
  ): void {
    if (session.huntingBotRouteUpdatePending) {
      session.sendError("hunting-bot-update-pending");
      return;
    }
    const route = sanitize(intent.route);
    const previous = session.huntingBotRoute;
    session.huntingBotRouteUpdatePending = true;
    // Applied in memory first so the very next tick walks the edited route;
    // the durable write trails behind and rolls the session back if it fails.
    session.huntingBotRoute = route;
    if (session.huntingBotEnabled && this.bot.start(session, now) !== "ok") {
      this.bot.stop(session, route.waypoints.length === 0 ? "no-route" : "out-of-range");
    }
    void this.persist(session, characterId, route, previous);
  }

  private handleEnabled(
    session: Session,
    intent: SetHuntingBotEnabledMessage,
    now: number,
  ): void {
    if (!intent.enabled) {
      this.bot.stop(session, null);
      return;
    }
    if (session.huntingBotRoute.waypoints.length === 0) {
      session.sendError("hunting-bot-invalid");
      return;
    }
    const started = this.bot.start(session, now);
    if (started === "wrong-floor") {
      session.sendError("hunting-bot-wrong-floor");
    } else if (started === "out-of-range") {
      session.sendError("hunting-bot-out-of-range");
    }
  }

  private handleTrace(
    session: Session,
    intent: HuntingBotTraceMessage,
    now: number,
  ): void {
    if (session.huntingBotTracePending) return;
    if (now < session.huntingBotTraceReadyAt) return;
    session.huntingBotTraceReadyAt = now + HUNTING_BOT_LIMITS.traceCooldownMs;
    session.huntingBotTracePending = true;
    void this.trace(session, [...intent.points]);
  }

  /**
   * Turns a hunting guide's straight lines into a walkable chain.
   *
   * This runs *between* ticks, one leg at a time: a whole route is far more
   * search than a 25 ms tick can absorb, and it reads nothing but map
   * geometry, so yielding is safe. The reply is queued and delivered from
   * inside the tick like every other trailing result (charter rules 3, 5).
   */
  private async trace(
    session: Session,
    points: ReadonlyArray<Position>,
  ): Promise<void> {
    const anchors = buildRouteAnchors(this.world, points);
    const waypoints: Position[] = [];
    const unresolvedWaypointIndexes: number[] = [];
    let spent = 0;
    let cursor = anchors[0]?.position;
    if (cursor) waypoints.push({ ...cursor });
    for (let index = 1; index < anchors.length; index++) {
      await new Promise((resolve) => setImmediate(resolve));
      if (!this.registry.contains(session)) return;
      const anchor = anchors[index];
      if (!anchor || !cursor) break;
      const leg = traceRouteLeg(this.world, cursor, anchor.position);
      spent += leg.visited;
      if (leg.resolved) {
        for (const point of leg.waypoints) waypoints.push(point);
      } else {
        unresolvedWaypointIndexes.push(waypoints.length);
        waypoints.push({ ...anchor.position });
      }
      cursor = anchor.position;
      if (waypoints.length >= HUNTING_BOT_LIMITS.maxWaypoints) break;
      // Whatever was asked for, one request only ever costs this much search.
      if (spent >= HUNTING_BOT_LIMITS.maxTraceVisited) break;
    }
    const capped = waypoints.slice(0, HUNTING_BOT_LIMITS.maxWaypoints);
    this.outcomes.push(() => {
      session.huntingBotTracePending = false;
      if (!this.registry.contains(session)) return;
      session.send({
        type: "hunting-bot-traced",
        waypoints: capped,
        unresolvedWaypointIndexes: unresolvedWaypointIndexes.filter(
          (index) => index < capped.length,
        ),
      });
    });
  }

  private async persist(
    session: Session,
    characterId: string,
    route: HuntingBotRoute,
    previous: HuntingBotRoute,
  ): Promise<void> {
    try {
      await this.characters.updateHuntingBotRoute(characterId, route);
      this.outcomes.push(() => {
        session.huntingBotRouteUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        session.send({ type: "hunting-bot-route", route });
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `hunting bot route update failed for character ${characterId}: ${reason}`,
      );
      this.outcomes.push(() => {
        session.huntingBotRouteUpdatePending = false;
        if (
          !this.registry.contains(session) ||
          session.playerId !== characterId
        ) {
          return;
        }
        session.huntingBotRoute = previous;
        session.send({ type: "hunting-bot-route", route: previous });
        session.sendError("hunting-bot-update-failed");
      });
    }
  }
}

/**
 * Consecutive duplicates are dropped so the bot cannot be handed a ring of
 * identical tiles it would spin on; everything else the schema already
 * bounded is kept as the player drew it.
 */
function sanitize(route: HuntingBotRoute): HuntingBotRoute {
  const waypoints: Position[] = [];
  for (const waypoint of route.waypoints) {
    const last = waypoints.at(-1);
    if (
      last &&
      last.x === waypoint.x &&
      last.y === waypoint.y &&
      last.z === waypoint.z
    ) {
      continue;
    }
    waypoints.push({ x: waypoint.x, y: waypoint.y, z: waypoint.z });
  }
  return { huntName: route.huntName.trim(), waypoints };
}
