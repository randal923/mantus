import {
  type HuntingBotRoute,
  type Position,
  type SetHuntingBotEnabledMessage,
  type UpdateHuntingBotRouteMessage,
} from "@tibia/protocol";
import type { CharacterStore } from "../character/CharacterStore";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { HuntingBot } from "./HuntingBot";
import { ResolvedOutcomes } from "../ResolvedOutcomes";

export type HuntingBotIntent =
  | UpdateHuntingBotRouteMessage
  | SetHuntingBotEnabledMessage;

/**
 * Owns the character's saved hunting route.
 *
 * The route itself is inert data — a list of tiles the character would like
 * to visit. Nothing about it is trusted as movement: `HuntingBot` hands each
 * waypoint to the movement system as a *destination*, and the server computes
 * and re-validates the walk. A hand-edited waypoint in the middle of a wall
 * therefore costs the player a skipped waypoint, never a teleport.
 */
export class HuntingBotHandler {
  private readonly outcomes = new ResolvedOutcomes();

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
    this.handleEnabled(session, intent, now);
  }

  applyResolvedOutcomes(now: number): void {
    this.outcomes.applyAll();
    // Work that arrived while its lane was busy runs as soon as the lane
    // clears; nothing a window asks for is ever silently dropped.
    for (const session of this.registry.all()) {
      this.startDeferred(session, now);
    }
  }

  private startDeferred(session: Session, now: number): void {
    const route = session.huntingBotDeferredRoute;
    if (route && !session.huntingBotRouteUpdatePending) {
      session.huntingBotDeferredRoute = null;
      if (session.playerId) this.applyRoute(session, session.playerId, route, now);
    }
  }

  private handleRoute(
    session: Session,
    characterId: string,
    intent: UpdateHuntingBotRouteMessage,
    now: number,
  ): void {
    if (session.huntingBotRouteUpdatePending) {
      // A durable write is still in flight. The newest edit wins once it
      // settles; refusing it would silently fork the window from the server.
      session.huntingBotDeferredRoute = intent.route;
      return;
    }
    this.applyRoute(session, characterId, intent.route, now);
  }

  private applyRoute(
    session: Session,
    characterId: string,
    requested: HuntingBotRoute,
    now: number,
  ): void {
    const route = sanitize(requested);
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
