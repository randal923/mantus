import type {
  CarriedPersistAudit,
  CarriedPersistRowOp,
} from "../CarriedPersistPlan";
import type { Item } from "../Item";
import type { WorldItemsView } from "./WorldItemsView";

/**
 * First-touch materialization of memory-only world items: appends a row
 * insert plus the creation audit for every item that has a loot origin (kill
 * loot) or a seed origin (a map chest opened but never taken from), in their
 * current state. Items that already have rows are left untouched. A seeded
 * insert carries its seed identity, so the `items.seed_key` unique index
 * rejects a second materialization of the same map item.
 */
export function appendUnpersistedLootInserts(
  world: WorldItemsView,
  items: ReadonlyArray<Item>,
  rowOps: CarriedPersistRowOp[],
  audits: CarriedPersistAudit[],
): void {
  for (const item of items) {
    const origin = world.lootOrigin(item.id);
    if (origin) {
      rowOps.push({ kind: "insert", item });
      audits.push({
        kind: "loot-created",
        itemId: item.id,
        eventId: origin.eventId,
        killerCharacterId: origin.killerCharacterId,
        typeId: item.typeId,
        count: item.count,
        ...(typeof item.attributes.rarity === "string"
          ? { rarity: item.attributes.rarity }
          : {}),
      });
      continue;
    }
    const seed = world.seedOrigin(item.id);
    // Map content is not an economy creation — the row insert plus the move's
    // own transfer audit are the whole record, exactly as picking a pristine
    // map item up off the ground already does.
    if (seed) rowOps.push({ kind: "insert", item, seed });
  }
}
