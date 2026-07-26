import type { InventoryItem, InventoryState } from "@tibia/protocol";
import { getInventoryItems } from "../inventory/getInventoryItems";
import { itemClassificationOf } from "./itemClassificationOf";

/**
 * Carried tier-0 items of the donor's classification and slot family — the
 * candidates a transfer may target. The server additionally normalizes
 * weapon families; this list is display-only and re-validated on transfer.
 */
export function collectTransferReceivers(
  inventory: InventoryState,
  donor: InventoryItem,
): ReadonlyArray<InventoryItem> {
  const classification = itemClassificationOf(donor);
  return getInventoryItems(inventory)
    .filter(
      (item) =>
        item.id !== donor.id &&
        (item.tier ?? 0) === 0 &&
        itemClassificationOf(item) === classification &&
        item.equipmentSlot === donor.equipmentSlot,
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}
