import type { ItemOverride } from "../ItemOverride";

/**
 * The bound container (Canary's store inbox), one per character in the
 * `bound` equipment slot. Renamed to say what it is here: the home of
 * character-bound items.
 */
export const boundItems: ItemOverride = {
  id: 23396,
  name: "bound items",
  article: "your",
  description:
    "Your character-bound items live here. They can never leave, " +
    "be dropped, or be traded.",
  movable: false,
};
