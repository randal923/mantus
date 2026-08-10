import type { ItemOverride } from "../ItemOverride";

/**
 * The Adventurer's Stone: every character owns exactly one, living in the
 * bound container, so unlike Canary's there is no replacement to fetch at a
 * temple and the stone itself is never movable.
 */
export const adventurersStone: ItemOverride = {
  id: 16277,
  description: "Use it in a city temple to travel to the Adventurers Guild.",
  movable: false,
};
