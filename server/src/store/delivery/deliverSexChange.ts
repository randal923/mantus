import { TransactionRollback } from "../../economy/TransactionRollback";
import { OUTFITS, STARTER_LOOK_TYPES } from "../../outfit/outfitCatalog";
import type { StorePurchaseEffect } from "../StorePurchaseEffect";
import type { StoreDeliveryContext } from "./StoreDeliveryContext";

const changeSexQuery = `UPDATE characters
       SET sex = $2, outfit_look_type = $3, outfit_addons = 0, updated_at = now()
       WHERE id = $1 AND sex = $4`;

const grantOutfitQuery = `INSERT INTO character_outfits (character_id, look_type, addons)
       VALUES ($1, $2, 0)
       ON CONFLICT (character_id, look_type) DO NOTHING`;

/**
 * Canary's `toggleSex`. A look type belongs to exactly one sex, so the worn
 * outfit cannot survive the flip: the character is moved onto the new sex's
 * first starter outfit and its addon bits reset, exactly as Canary does.
 *
 * The character's *entitlements* are left alone — rows of the wrong sex are
 * never listed or selectable — so an outfit bought before the change is still
 * there if the player changes back. The new sex's starter outfits are granted
 * here so the character is never left with nothing it may wear.
 */
export async function deliverSexChange(
  context: StoreDeliveryContext,
): Promise<StorePurchaseEffect> {
  const wasMale = context.character.sex === 1;
  const nextSex = wasMale ? "female" : "male";
  const starters = STARTER_LOOK_TYPES[nextSex];
  const lookType = starters[0];
  if (lookType === undefined || OUTFITS.get(lookType)?.sex !== nextSex) {
    throw new TransactionRollback({ status: "failed" as const });
  }

  for (const starter of starters) {
    await context.client.query(grantOutfitQuery, [
      context.characterId,
      starter,
    ]);
  }
  // Guarded by the sex we read under the row lock, so two concurrent
  // purchases cannot flip twice and land back where they started.
  const changed = await context.client.query(changeSexQuery, [
    context.characterId,
    wasMale ? 0 : 1,
    lookType,
    wasMale ? 1 : 0,
  ]);
  if (changed.rowCount !== 1) {
    throw new TransactionRollback({ status: "failed" as const });
  }
  return { kind: "sex-change", sex: nextSex, lookType };
}
