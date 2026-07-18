import { DEPOT_LIMITS, type DepotLocation } from "@tibia/protocol";
import type { Item } from "../item/Item";
import { collectDescendantItems } from "./collectDescendantItems";
import type { DepotCache } from "./DepotCache";
import type { DepotItemRecord, DepotPage, StashItemRecord } from "./DepotStore";
import { depotSnapshotOf } from "./depotSnapshotOf";

/**
 * Serves one browse page straight from the cache, mirroring the retired DB
 * queries' semantics: root entries only, ordered by (type, slot, id), filtered
 * by pre-resolved matching item type ids (null = no search).
 */
export function depotPageOf(
  cache: DepotCache,
  depotId: number,
  location: DepotLocation,
  page: number,
  matchingItemTypeIds: ReadonlyArray<number> | null,
): DepotPage {
  const snapshot = depotSnapshotOf(cache, depotId);
  const offset = (page - 1) * DEPOT_LIMITS.pageSize;
  if (matchingItemTypeIds?.length === 0) {
    return { snapshot, totalEntries: 0, entries: [] };
  }
  const matching =
    matchingItemTypeIds === null ? null : new Set(matchingItemTypeIds);
  if (location === "stash") {
    const stashEntries = [...cache.stash]
      .filter(([itemTypeId]) => matching === null || matching.has(itemTypeId))
      .sort(([left], [right]) => left - right);
    const entries: StashItemRecord[] = stashEntries
      .slice(offset, offset + DEPOT_LIMITS.pageSize)
      .map(([itemTypeId, count]) => ({ location: "stash", itemTypeId, count }));
    return { snapshot, totalEntries: stashEntries.length, entries };
  }
  const roots = cache.items.filter((item) =>
    location === "depot"
      ? item.location.kind === "depot" && item.location.depotId === depotId
      : item.location.kind === "inbox",
  );
  const matchingRoots = roots
    .filter((item) => matching === null || matching.has(item.typeId))
    .sort(compareStoredRoots);
  const entries: DepotItemRecord[] = matchingRoots
    .slice(offset, offset + DEPOT_LIMITS.pageSize)
    .map((item) => ({
      location,
      slot: slotOf(item),
      item,
      containedItemCount: collectDescendantItems(cache.items, item.id).length,
    }));
  return { snapshot, totalEntries: matchingRoots.length, entries };
}

function compareStoredRoots(left: Item, right: Item): number {
  if (left.typeId !== right.typeId) return left.typeId - right.typeId;
  const slotDelta = slotOf(left) - slotOf(right);
  if (slotDelta !== 0) return slotDelta;
  return left.id.localeCompare(right.id);
}

function slotOf(item: Item): number {
  if (item.location.kind === "depot" || item.location.kind === "inbox") {
    return item.location.slot;
  }
  throw new Error(`item ${item.id} is not a stored root`);
}
