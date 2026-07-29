import { PREY_RULES, TASK_HUNTING_RULES } from "@tibia/protocol";
import { TransactionRollback } from "../../economy/TransactionRollback";
import type { StorePurchaseEffect } from "../StorePurchaseEffect";
import type { StoreDeliveryContext } from "./StoreDeliveryContext";

/**
 * Canary's Permanent Prey Slot / Permanent Hunting Task Slot: unlocks the
 * highest still-locked slot. The UPDATE is conditional on the row still being
 * `locked`, so two concurrent purchases unlock one slot each at most and a
 * purchase with nothing left to unlock is refused rather than charged.
 */
const unlockPreySlotQuery = `UPDATE character_prey_slots
       SET state = 'inactive'
       WHERE character_id = $1
         AND slot = (
           SELECT MIN(slot) FROM character_prey_slots
           WHERE character_id = $1 AND state = 'locked'
         )
       RETURNING slot`;

const unlockTaskSlotQuery = `UPDATE character_task_slots
       SET state = 'inactive'
       WHERE character_id = $1
         AND slot = (
           SELECT MIN(slot) FROM character_task_slots
           WHERE character_id = $1 AND state = 'locked'
         )
       RETURNING slot`;

/** Creates the slot rows a character loaded before the purchase may lack. */
const ensurePreySlotsQuery = `INSERT INTO character_prey_slots (character_id, slot, state)
       SELECT $1, slot, CASE WHEN slot = 0 THEN 'inactive' ELSE 'locked' END
       FROM generate_series(0, $2::int - 1) AS slot
       ON CONFLICT (character_id, slot) DO NOTHING`;

const ensureTaskSlotsQuery = `INSERT INTO character_task_slots (character_id, slot, state)
       SELECT $1, slot, CASE WHEN slot = 0 THEN 'inactive' ELSE 'locked' END
       FROM generate_series(0, $2::int - 1) AS slot
       ON CONFLICT (character_id, slot) DO NOTHING`;

export async function deliverSlotUnlock(
  context: StoreDeliveryContext,
  kind: "prey-slot" | "hunting-slot",
): Promise<StorePurchaseEffect> {
  const isPrey = kind === "prey-slot";
  await context.client.query(
    isPrey ? ensurePreySlotsQuery : ensureTaskSlotsQuery,
    [
      context.characterId,
      isPrey ? PREY_RULES.slotCount : TASK_HUNTING_RULES.slotCount,
    ],
  );
  const unlocked = await context.client.query<{ slot: number }>(
    isPrey ? unlockPreySlotQuery : unlockTaskSlotQuery,
    [context.characterId],
  );
  const slot = unlocked.rows[0]?.slot;
  if (slot === undefined) {
    throw new TransactionRollback({ status: "already-owned" as const });
  }
  return isPrey ? { kind: "prey-slot", slot } : { kind: "hunting-slot", slot };
}
