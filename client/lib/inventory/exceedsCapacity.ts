import type { InventoryState } from "@tibia/protocol";

/**
 * True only when adding `addedWeight` (hundredths of oz) certainly exceeds
 * capacity. `capacityUsed` is rounded up to whole oz by the server, so the
 * lower bound of the real used weight is compared — never rejecting an op
 * the server would accept.
 */
export function exceedsCapacity(
  inventory: Pick<InventoryState, "capacityUsed" | "capacityMax">,
  addedWeight: number,
): boolean {
  const minUsedWeight =
    inventory.capacityUsed === 0 ? 0 : (inventory.capacityUsed - 1) * 100 + 1;
  return minUsedWeight + addedWeight > inventory.capacityMax * 100;
}
