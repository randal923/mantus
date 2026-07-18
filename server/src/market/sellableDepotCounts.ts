import type { DepotCache } from "../depot/DepotCache";

/**
 * Counts pristine (empty attributes, no contained items) depot stock per item
 * type across all the character's depots — the amounts they could escrow.
 */
export function sellableDepotCounts(
  cache: DepotCache,
): ReadonlyMap<number, number> {
  const parentIds = new Set<string>();
  for (const item of cache.items) {
    if (item.location.kind === "container" || item.location.kind === "corpse") {
      parentIds.add(item.location.containerId);
    }
  }
  const counts = new Map<number, number>();
  for (const item of cache.items) {
    if (
      item.location.kind !== "depot" ||
      Object.keys(item.attributes).length > 0 ||
      parentIds.has(item.id)
    ) {
      continue;
    }
    counts.set(item.typeId, (counts.get(item.typeId) ?? 0) + item.count);
  }
  return counts;
}
