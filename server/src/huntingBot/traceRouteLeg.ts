import { HUNTING_BOT_LIMITS, type Position } from "@tibia/protocol";
import type { RouteMap } from "./RouteMap";
import { findRoutePath } from "./findRoutePath";

/**
 * Walks one anchor to the next and reports the turning points of the path.
 *
 * The bot re-paths between consecutive waypoints at run time, so a waypoint
 * chain only has to be dense enough that each hop is a short, obvious search.
 * Emitting a point at every corner and at least every `maxWaypointSpacing`
 * tiles gives that, and it keeps the chain faithful: consecutive waypoints
 * are joined by a straight run of the real path, so drawing lines between
 * them draws the route the character will actually walk.
 */
export function traceRouteLeg(
  map: RouteMap,
  from: Position,
  to: Position,
): { waypoints: Position[]; resolved: boolean; visited: number } {
  const margin = HUNTING_BOT_LIMITS.traceLegMargin;
  const { steps, visited } = findRoutePath({
    map,
    start: from,
    goal: to,
    bounds: {
      minX: Math.min(from.x, to.x) - margin,
      maxX: Math.max(from.x, to.x) + margin,
      minY: Math.min(from.y, to.y) - margin,
      maxY: Math.max(from.y, to.y) + margin,
    },
    maxVisited: HUNTING_BOT_LIMITS.maxTraceLegVisited,
  });
  if (steps.length === 0) {
    const reached = from.x === to.x && from.y === to.y && from.z === to.z;
    return { waypoints: [], resolved: reached, visited };
  }
  const waypoints: Position[] = [];
  let sinceWaypoint = 0;
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (!step) continue;
    sinceWaypoint++;
    const previousFloor = index === 0 ? from.z : steps[index - 1]!.to.z;
    const next = steps[index + 1];
    if (
      !next ||
      next.direction !== step.direction ||
      step.to.z !== previousFloor ||
      sinceWaypoint >= HUNTING_BOT_LIMITS.maxWaypointSpacing
    ) {
      waypoints.push({ ...step.to });
      sinceWaypoint = 0;
    }
  }
  return { waypoints, resolved: true, visited };
}
