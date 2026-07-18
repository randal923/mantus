import type { Item } from "../item/Item";

/** Climbs container/corpse links to the top-level stored item. */
export function resolveStoredRoot(
  itemsById: ReadonlyMap<string, Item>,
  item: Item,
): Item {
  let current = item;
  for (let depth = 0; depth < 8; depth++) {
    if (
      current.location.kind !== "container" &&
      current.location.kind !== "corpse"
    ) {
      return current;
    }
    const parent = itemsById.get(current.location.containerId);
    if (!parent) return current;
    current = parent;
  }
  return current;
}
