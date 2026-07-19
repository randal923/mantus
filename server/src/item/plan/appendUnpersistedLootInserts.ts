import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { WorldItemsView } from "./WorldItemsView";

/**
 * First-touch materialization of memory-only kill loot: appends a row insert
 * plus the creation audit for every item that has a loot origin, in their
 * current state. Items that already have rows are left untouched.
 */
export function appendUnpersistedLootInserts(
  world: WorldItemsView,
  items: ReadonlyArray<Item>,
  rowOps: CarriedPersistRowOp[],
  audits: CarriedPersistAudit[],
): void {
  for (const item of items) {
    const origin = world.lootOrigin(item.id);
    if (!origin) continue;
    rowOps.push({ kind: "insert", item });
    audits.push({
      kind: "loot-created",
      itemId: item.id,
      eventId: origin.eventId,
      killerCharacterId: origin.killerCharacterId,
      typeId: item.typeId,
      count: item.count,
    });
  }
}
