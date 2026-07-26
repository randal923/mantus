import type { InventoryItem, InventoryState } from "@tibia/protocol";
import { getInventoryItems } from "../inventory/getInventoryItems";
import { itemClassificationOf } from "./itemClassificationOf";

/**
 * Carried classified items at tier 2+ — the only valid transfer donors.
 * Display-only derivation; the server re-validates the donor on transfer.
 */
export function collectTransferDonors(
  inventory: InventoryState,
): ReadonlyArray<InventoryItem> {
  return getInventoryItems(inventory)
    .filter(
      (item) => (item.tier ?? 0) >= 2 && itemClassificationOf(item) > 0,
    )
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        (left.tier ?? 0) - (right.tier ?? 0),
    );
}
