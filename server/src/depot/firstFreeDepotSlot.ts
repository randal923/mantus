import { DEPOT_LIMITS } from "@tibia/protocol";
import type { DepotCache } from "./DepotCache";

export function firstFreeDepotSlot(
  cache: DepotCache,
  depotId: number,
): number | null {
  const occupied = new Set<number>();
  for (const item of cache.items) {
    if (item.location.kind === "depot" && item.location.depotId === depotId) {
      occupied.add(item.location.slot);
    }
  }
  for (let slot = 0; slot < DEPOT_LIMITS.maxDepotItems; slot++) {
    if (!occupied.has(slot)) return slot;
  }
  return null;
}
