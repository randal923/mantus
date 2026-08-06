import { HUNT_SPOT_SEPARATOR } from "./huntRouteName";

/**
 * Reads back what `huntRouteName` wrote, so reopening the window lands on the
 * hunt and the cave the saved route was seeded from. A name with no separator
 * is a hunt with a single cave — or a route saved by hand, which is equally
 * fine: the spot simply falls back to the hunt's own.
 */
export function parseHuntRouteName(huntName: string): {
  readonly placeName: string;
  readonly spotName: string | null;
} {
  const index = huntName.indexOf(HUNT_SPOT_SEPARATOR);
  if (index < 0) return { placeName: huntName, spotName: null };
  return {
    placeName: huntName.slice(0, index),
    spotName: huntName.slice(index + HUNT_SPOT_SEPARATOR.length),
  };
}
