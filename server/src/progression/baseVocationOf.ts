import type { CharacterVocation } from "@tibia/protocol";
import { getVocation } from "./getVocation";

/** Walks the promotion chain down to the base vocation. */
export function baseVocationOf(vocation: CharacterVocation): CharacterVocation {
  let current = vocation;
  for (let hops = 0; hops < 4; hops++) {
    const promotedFrom = getVocation(current).promotedFrom;
    if (promotedFrom === null) return current;
    current = promotedFrom;
  }
  return current;
}
