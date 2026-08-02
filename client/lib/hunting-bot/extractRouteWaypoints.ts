import type { Position } from "@tibia/protocol";
import type { HuntingPath } from "../hunt-finder/HuntingPlace";

/**
 * Flattens one floor of a hunting guide's route into an ordered ring.
 *
 * The guide stores the route as a list of `[start, end]` segments walked in
 * order. Most chain end-to-end, but some branch off to a dead-end spur and
 * pick up again from an earlier tile; taking each segment's start when it
 * does not continue the previous one keeps those spurs in the walking order
 * instead of silently dropping them.
 *
 * The result is only the *intent* of the route — these coordinates are drawn
 * on a wiki map and run straight through walls. The server turns them into
 * something walkable.
 */
export function extractRouteWaypoints(
  path: HuntingPath,
  floor: number,
): Position[] {
  const segments = path.Coordinates[String(floor)] ?? [];
  const waypoints: Position[] = [];
  const push = (position: Position): void => {
    const last = waypoints.at(-1);
    if (
      last &&
      last.x === position.x &&
      last.y === position.y &&
      last.z === position.z
    ) {
      return;
    }
    waypoints.push({ x: position.x, y: position.y, z: position.z });
  };
  for (const [start, end] of segments) {
    push(start);
    push(end);
  }
  // The bot loops, so an explicitly closed ring would walk its first tile
  // twice in a row.
  const first = waypoints[0];
  const last = waypoints.at(-1);
  if (
    waypoints.length > 1 &&
    first &&
    last &&
    first.x === last.x &&
    first.y === last.y &&
    first.z === last.z
  ) {
    waypoints.pop();
  }
  return waypoints;
}
