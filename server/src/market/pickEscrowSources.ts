import type { DepotCache } from "../depot/DepotCache";
import type { EscrowSource } from "./MarketStore";

/**
 * Chooses pristine depot rows (empty attributes, no contained items) from any
 * of the character's depots to cover `amount`, splitting at most the last
 * row. Pure memory-side planning; the store re-verifies every row inside the
 * transaction at execution time.
 */
export function pickEscrowSources(
  cache: DepotCache,
  itemTypeId: number,
  amount: number,
): ReadonlyArray<EscrowSource> | null {
  const parentIds = new Set<string>();
  for (const item of cache.items) {
    if (item.location.kind === "container" || item.location.kind === "corpse") {
      parentIds.add(item.location.containerId);
    }
  }
  const candidates = cache.items
    .filter(
      (item) =>
        item.location.kind === "depot" &&
        item.typeId === itemTypeId &&
        Object.keys(item.attributes).length === 0 &&
        !parentIds.has(item.id),
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const sources: EscrowSource[] = [];
  let remaining = amount;
  for (const item of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(item.count, remaining);
    sources.push({ itemId: item.id, itemRevision: item.version, take });
    remaining -= take;
  }
  return remaining > 0 ? null : sources;
}
