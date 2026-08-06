import { HUNTING_BOT_LIMITS } from "@tibia/protocol";

/** Separates a hunt from the one of its caves a saved route belongs to. */
export const HUNT_SPOT_SEPARATOR = " · ";

/**
 * What a saved route calls itself. A hunt with one cave keeps the hunt's own
 * name, so every route saved before hunts gathered their caves still matches
 * the entry it came from.
 */
export function huntRouteName(placeName: string, spotName: string): string {
  const full =
    spotName === placeName || spotName.length === 0
      ? placeName
      : `${placeName}${HUNT_SPOT_SEPARATOR}${spotName}`;
  return full.slice(0, HUNTING_BOT_LIMITS.maxHuntNameLength);
}
