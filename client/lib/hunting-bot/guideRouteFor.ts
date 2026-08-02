import type { Position } from "@tibia/protocol";
import type { HuntingPlace } from "../hunt-finder/HuntingPlace";
import { extractRouteWaypoints } from "./extractRouteWaypoints";

/**
 * The guide's own route for one hunt, on the floor the character can actually
 * use. A guide may cover several floors with no way to say how to get between
 * them, so a route is seeded from one floor at a time: the character's own if
 * the guide covers it, otherwise the lowest one it does.
 */
export function guideRouteFor(
  place: HuntingPlace,
  preferredFloor: number | null,
): { floor: number | null; waypoints: Position[] } {
  const floors = Object.keys(place.RoutePath.Coordinates)
    .map(Number)
    .filter((floor) => Number.isInteger(floor))
    .toSorted((left, right) => left - right);
  const floor =
    floors.find((value) => value === preferredFloor) ?? floors.at(0) ?? null;
  if (floor === null) return { floor: null, waypoints: [] };
  return { floor, waypoints: extractRouteWaypoints(place.RoutePath, floor) };
}
