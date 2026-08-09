import type { Item } from "../Item";
import { findBoundRoot } from "./findBoundRoot";

/**
 * Whether an item is character-bound in place: the bound container itself, or
 * one of its direct children (the loot pouch, the Portable Seller). Locked
 * items never leave the bound container — not by move, drop, equip, deposit,
 * stash, or trade. Deeper descendants (the loot inside the pouch) are free.
 */
export function isBoundLockedItem(
  items: ReadonlyArray<Item>,
  item: Item,
): boolean {
  if (item.location.kind === "equipment") {
    return item.location.slot === "bound";
  }
  if (item.location.kind !== "container") return false;
  const containerId = item.location.containerId;
  const root = findBoundRoot(items);
  return root !== undefined && root.id === containerId;
}
