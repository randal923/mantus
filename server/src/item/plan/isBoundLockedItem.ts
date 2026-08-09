import type { Item } from "../Item";
import { BOUND_ITEM_TYPE_IDS } from "../boundItemTypeIds";
import { findBoundRoot } from "./findBoundRoot";

/**
 * Whether an item is character-bound in place: the bound container itself, or
 * a direct child of one of its bound item types (the loot pouch, the
 * Portable Seller). Locked items never leave the bound container — not by
 * move, drop, equip, deposit, stash, or trade. Everything else inside —
 * store deliveries waiting to be picked up, the loot inside the pouch — is
 * free to move out.
 */
export function isBoundLockedItem(
  items: ReadonlyArray<Item>,
  item: Item,
): boolean {
  if (item.location.kind === "equipment") {
    return item.location.slot === "bound";
  }
  if (item.location.kind !== "container") return false;
  if (!BOUND_ITEM_TYPE_IDS.has(item.typeId)) return false;
  const containerId = item.location.containerId;
  const root = findBoundRoot(items);
  return root !== undefined && root.id === containerId;
}
