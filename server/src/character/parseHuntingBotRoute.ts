import {
  DEFAULT_HUNTING_BOT_ROUTE,
  huntingBotRouteSchema,
  type HuntingBotRoute,
} from "@tibia/protocol";

/**
 * Parses the persisted hunting route. Anything unrecognised degrades to an
 * empty route rather than throwing: a corrupt preference must not block
 * login, and the bot re-paths and re-validates every step anyway.
 */
export function parseHuntingBotRoute(raw: unknown): HuntingBotRoute {
  const parsed = huntingBotRouteSchema.safeParse(raw);
  if (!parsed.success) return { ...DEFAULT_HUNTING_BOT_ROUTE, waypoints: [] };
  return {
    huntName: parsed.data.huntName,
    waypoints: parsed.data.waypoints.map((waypoint) => ({ ...waypoint })),
  };
}
