import type { HuntingPlace, HuntingSpot } from "./HuntingPlace";

/**
 * The caves of one hunt, its own route first.
 *
 * A hunt whose guide describes a single cave still has one spot, so every
 * caller can treat "which cave" the same way instead of branching on whether
 * the entry happens to gather several.
 */
export function huntingSpots(place: HuntingPlace): ReadonlyArray<HuntingSpot> {
  const own: HuntingSpot = {
    Name: place.SpotName ?? place.Name,
    ...(place.Generated === undefined ? {} : { Generated: place.Generated }),
    Position: place.SpotPosition ??
      place.WayPath.Position ??
      firstRouteTile(place) ?? { x: 0, y: 0, z: 7 },
    WayPath: place.WayPath,
    RoutePath: place.RoutePath,
  };
  return [own, ...(place.Spots ?? [])];
}

function firstRouteTile(place: HuntingPlace): HuntingSpot["Position"] | null {
  const floors = Object.keys(place.RoutePath.Coordinates)
    .map(Number)
    .filter((floor) => Number.isInteger(floor))
    .toSorted((left, right) => left - right);
  for (const floor of floors) {
    const start = place.RoutePath.Coordinates[String(floor)]?.[0]?.[0];
    if (start) return start;
  }
  return null;
}
