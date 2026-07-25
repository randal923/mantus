import type { CarriedPersistPlan } from "../CarriedPersistPlan";
import type { WorldItemsView } from "./WorldItemsView";

/**
 * Guards the memory-first corpse and map-seed invariant: an item with a loot
 * or seed origin has no DB row yet, so a guarded `write`/`delete`/`stage`
 * against it can only miss.
 * A missed guarded op means memory and DB diverged — the persist chain is
 * poisoned and the player is resynced or disconnected — so a plan must insert
 * such an item before it ever guards one.
 *
 * Returns a description of the first violation, or null when the plan is safe.
 */
export function findUnpersistedGuardViolation(
  world: WorldItemsView,
  plan: CarriedPersistPlan,
): string | null {
  const inserted = new Set<string>();
  for (const op of plan.rowOps) {
    if (op.kind === "insert") {
      inserted.add(op.item.id);
      continue;
    }
    const itemId = op.kind === "write" ? op.item.id : op.itemId;
    if (inserted.has(itemId)) continue;
    if (
      world.lootOrigin(itemId) === undefined &&
      world.seedOrigin(itemId) === undefined
    ) {
      continue;
    }
    return `${op.kind} guards unpersisted item ${itemId}`;
  }
  return null;
}
