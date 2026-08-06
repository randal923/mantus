import type { Position } from "@tibia/protocol";
import type { HuntingSpot } from "../hunt-finder/HuntingPlace";
import { extractRouteWaypoints } from "./extractRouteWaypoints";

/**
 * The guide's own route for one cave of a hunt: every floor it describes, one
 * floor's ring after another.
 *
 * A cave dug through three floors is three rings with a ladder between them,
 * and the bot cannot use a ladder — so it walks the ring on the floor the
 * character is standing on and steps over the rest. Seeding all of them means
 * climbing down yourself continues the hunt below instead of leaving an empty
 * map. The character's own floor leads, so arming joins the nearest ring.
 */
export function guideRouteFor(
  spot: HuntingSpot,
  preferredFloor: number | null,
): { floor: number | null; waypoints: Position[] } {
  const floors = Object.keys(spot.RoutePath.Coordinates)
    .map(Number)
    .filter((floor) => Number.isInteger(floor))
    .toSorted((left, right) => left - right);
  const floor =
    floors.find((value) => value === preferredFloor) ?? floors.at(0) ?? null;
  if (floor === null) return { floor: null, waypoints: [] };
  const ordered = [floor, ...floors.filter((value) => value !== floor)];
  return {
    floor,
    waypoints: ordered.flatMap((value) =>
      extractRouteWaypoints(spot.RoutePath, value),
    ),
  };
}
