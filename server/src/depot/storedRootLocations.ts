import type { Item } from "../item/Item";
import type { ItemLocation } from "../item/ItemLocation";
import { resolveStoredRoot } from "./resolveStoredRoot";

/** Maps every cached item id to the location of its top-level stored root. */
export function storedRootLocations(
  items: ReadonlyArray<Item>,
): ReadonlyMap<string, ItemLocation> {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const locations = new Map<string, ItemLocation>();
  for (const item of items) {
    locations.set(item.id, resolveStoredRoot(itemsById, item).location);
  }
  return locations;
}
