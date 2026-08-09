import { HUNT_SPOT_SEPARATOR } from "../hunting-bot/huntRouteName";
import type { HuntingPlace } from "./HuntingPlace";

/**
 * The catalog entry a tracked minimap route came from. A route names itself
 * either after the hunt or `hunt · cave`, so both shapes point back to one
 * place.
 */
export function findTrackedPlace(
  places: ReadonlyArray<HuntingPlace>,
  trackedName: string | null,
): HuntingPlace | null {
  if (trackedName === null) return null;
  return (
    places.find(
      (place) =>
        place.Name === trackedName ||
        trackedName.startsWith(place.Name + HUNT_SPOT_SEPARATOR),
    ) ?? null
  );
}
