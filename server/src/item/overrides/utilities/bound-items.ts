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
    "Store purchases are delivered here. Your Loot Pouch and Portable " +
    "Seller are bound to you and never leave; everything else can be " +
    "taken out.",
  // 500 = MAX_CONTAINER_CAPACITY renders as unlimited slots, and the
  // 500-row carried cap binds long before the slots would.
  containerCapacity: 500,
  movable: false,
};
