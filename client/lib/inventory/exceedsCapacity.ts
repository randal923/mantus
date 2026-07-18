import type { InventoryState } from "@tibia/protocol";

/**
 * True when adding `addedWeight` (hundredths of oz) exceeds carry capacity,
 * mirroring the server's `usedWeight > capacityMax * 100` comparison against
 * the exact used weight it reports in the inventory state.
 */
export function exceedsCapacity(
  inventory: Pick<InventoryState, "usedWeight" | "capacityMax">,
  addedWeight: number,
): boolean {
  return inventory.usedWeight + addedWeight > inventory.capacityMax * 100;
}
