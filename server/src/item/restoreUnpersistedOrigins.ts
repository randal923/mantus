import type { World } from "../World";
import type { CarriedPersistPlan } from "./CarriedPersistPlan";
import type { LootOrigin } from "./LootOrigin";

/**
 * Re-marks the memory-only world items a dropped persist plan was going to
 * materialize.
 *
 * `applyItemMutation` clears an item's loot or seed origin the moment the
 * memory mutation lands, because the plan built alongside it carries the row
 * insert. A plan that never commits — a failed write, or one skipped because
 * the character is poisoned — leaves that item with no origin and no row: no
 * later plan can insert it, every guarded op against it misses (poisoning the
 * next player who touches it), and its decay retries against the store
 * forever. Restoring the origin puts the item back in its true state, memory
 * only, exactly as it was before the dropped plan.
 *
 * Only items still living in the world are restored. An item the plan moved
 * into a character's inventory is gone from the world either way and is
 * reconciled by the resync that reloads them from committed rows.
 */
export function restoreUnpersistedOrigins(
  world: World,
  plan: CarriedPersistPlan,
): void {
  const lootOrigins = new Map<string, LootOrigin>();
  for (const audit of plan.audits) {
    if (audit.kind !== "loot-created") continue;
    lootOrigins.set(audit.itemId, {
      eventId: audit.eventId,
      killerCharacterId: audit.killerCharacterId,
    });
  }
  for (const op of plan.rowOps) {
    if (op.kind !== "insert") continue;
    if (!world.getWorldItem(op.item.id)) continue;
    const origin = lootOrigins.get(op.item.id);
    if (origin) {
      world.registerUnpersistedLootItems([op.item], origin);
      continue;
    }
    if (op.seed) world.registerUnpersistedSeedItems([op.item], op.seed);
  }
}
