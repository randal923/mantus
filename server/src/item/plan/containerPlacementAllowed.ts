import type { Item } from "../Item";
import { containerAncestryChain } from "./containerAncestryChain";
import { subtreeHeight } from "./subtreeHeight";

/**
 * True when `itemId` may be placed inside `destination`: no cycle through the
 * destination's ancestry and no nesting beyond 8 levels — the memory mirror
 * of the DB-side placement guard.
 */
export function containerPlacementAllowed(
  items: ReadonlyArray<Item>,
  itemsById: ReadonlyMap<string, Item>,
  itemId: string,
  destination: Item,
): boolean {
  const ancestry = containerAncestryChain(itemsById, destination);
  if (ancestry.some((ancestor) => ancestor.id === itemId)) return false;
  return ancestry.length + subtreeHeight(items, itemId) <= 8;
}
