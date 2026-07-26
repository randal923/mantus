import type { PodiumDisplay } from "@tibia/protocol";
import { podiumStateOf } from "./podiumStateOf";

/**
 * The viewer-facing display payload for a podium's tile state, or undefined
 * when nothing is on display. Monster selections honor the hide toggle;
 * renown outfits show whenever an outfit or mount is set.
 */
export function podiumDisplayOf(
  attributes: Readonly<Record<string, unknown>>,
): PodiumDisplay | undefined {
  const stored = podiumStateOf(attributes);
  const hasLook =
    stored.lookType > 0 || stored.lookTypeEx > 0 || stored.mountLookType > 0;
  if (!hasLook) return undefined;
  if (stored.raceId > 0 && !stored.monsterVisible) return undefined;
  return {
    lookType: stored.lookType,
    lookTypeEx: stored.lookTypeEx,
    head: stored.head,
    body: stored.body,
    legs: stored.legs,
    feet: stored.feet,
    addons: stored.addons,
    mountLookType: stored.mountLookType,
    direction: stored.direction,
  };
}
