import type { DepotCache } from "../depot/DepotCache";
import type { EscrowSource } from "./MarketStore";

export interface EscrowPlan {
  /** Pristine depot rows, split at most on the last one. */
  readonly sources: ReadonlyArray<EscrowSource>;
  /** Units the stash covers once the depot rows run out. */
  readonly stashTake: number;
}

/**
 * Chooses stock to cover `amount`: pristine depot rows (empty attributes, no
 * contained items) from any of the character's depots first, then the supply
 * stash for whatever is left. Stashed stock is pristine by construction —
 * only attribute-free stowable items can enter it.
 *
 * Pure memory-side planning; the store re-verifies every row and re-reads the
 * stash counter inside the transaction at execution time.
 */
export function pickEscrowSources(
  cache: DepotCache,
  itemTypeId: number,
  amount: number,
): EscrowPlan | null {
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
  if (remaining <= 0) return { sources, stashTake: 0 };
  const stashed = cache.stash.get(itemTypeId) ?? 0;
  if (stashed < remaining) return null;
  return { sources, stashTake: remaining };
}
