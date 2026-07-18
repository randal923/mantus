import type { DepotCache } from "./DepotCache";
import type { DepotSnapshot } from "./DepotStore";
import { storedRootLocations } from "./storedRootLocations";

/** Counts match the DB's held-item semantics: every subtree row counts. */
export function depotSnapshotOf(
  cache: DepotCache,
  depotId: number,
): DepotSnapshot {
  const roots = storedRootLocations(cache.items);
  let depotCount = 0;
  let inboxCount = 0;
  for (const item of cache.items) {
    const root = roots.get(item.id);
    if (!root) continue;
    if (root.kind === "depot" && root.depotId === depotId) depotCount += 1;
    if (root.kind === "inbox") inboxCount += 1;
  }
  return {
    depotRevision: cache.depotRevisions.get(depotId) ?? 1,
    inboxRevision: cache.inboxRevision,
    stashRevision: cache.stashRevision,
    depotCount,
    inboxCount,
    stashCount: cache.stash.size,
  };
}
