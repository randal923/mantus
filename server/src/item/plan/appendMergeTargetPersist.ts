import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { WorldItemsView } from "./WorldItemsView";

/**
 * Persists a world stack that just absorbed a merge. A memory-only kill-loot
 * survivor has no row to guard-update — a `write` against it would miss,
 * poison the persist chain, and resync the player — so its first touch is an
 * insert in the already-merged state plus the creation audit that accounts for
 * the count it contributes.
 */
export function appendMergeTargetPersist(
  world: WorldItemsView,
  mergeTarget: Item,
  merged: Item,
  rowOps: CarriedPersistRowOp[],
  audits: CarriedPersistAudit[],
): void {
  const origin = world.lootOrigin(mergeTarget.id);
  if (!origin) {
    rowOps.push({
      kind: "write",
      expectedVersion: mergeTarget.version,
      item: merged,
    });
    return;
  }
  rowOps.push({ kind: "insert", item: merged });
  audits.push({
    kind: "loot-created",
    itemId: mergeTarget.id,
    eventId: origin.eventId,
    killerCharacterId: origin.killerCharacterId,
    typeId: mergeTarget.typeId,
    count: mergeTarget.count,
  });
}
