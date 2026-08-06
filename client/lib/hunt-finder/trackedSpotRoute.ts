import type { MinimapRoute } from "../minimap/MinimapRoute";
import { huntRouteName } from "../hunting-bot/huntRouteName";
import type { HuntingPlace, HuntingSpot } from "./HuntingPlace";

/**
 * The path the live minimap draws when a hunt is tracked: the way in to the
 * cave the player is looking at, not the hunt's own.
 *
 * A hunt with several caves has several ways in, and tracking the first one
 * while reading the third is how a player ends up walking to the wrong hole.
 * Caves the guide has no approach for fall back to the ring itself, which at
 * least points at the right ground.
 */
export function trackedSpotRoute(
  place: HuntingPlace,
  spot: HuntingSpot,
): MinimapRoute {
  const path = spot.WayPath ?? spot.RoutePath;
  return {
    name: huntRouteName(place.Name, spot.Name),
    coordinates: path.Coordinates,
    destination: path.Position ?? spot.Position,
  };
}
