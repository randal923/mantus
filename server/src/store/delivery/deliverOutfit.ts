import { TransactionRollback } from "../../economy/TransactionRollback";
import { OUTFITS } from "../../outfit/outfitCatalog";
import type { StorePurchaseEffect } from "../StorePurchaseEffect";
import type { StoreDeliveryContext } from "./StoreDeliveryContext";

/** Merges addon bits, so re-granting never removes an addon already owned. */
const grantOutfitQuery = `INSERT INTO character_outfits (character_id, look_type, addons)
       VALUES ($1, $2, $3)
       ON CONFLICT (character_id, look_type)
       DO UPDATE SET addons = character_outfits.addons | EXCLUDED.addons
       WHERE character_outfits.addons <> (character_outfits.addons | EXCLUDED.addons)`;

const ownedOutfitQuery = `SELECT addons FROM character_outfits
       WHERE character_id = $1 AND look_type = $2`;

/**
 * Grants the look type matching the buyer's *own* sex, read from the locked
 * character row rather than from anything the client sent. Canary grants both
 * sexes' look types so a later sex change keeps the outfit; the wrong-sex row
 * is never listed or selectable, so it is harmless and does the same job.
 *
 * Ownership is re-checked here, inside the transaction: an outfit bought
 * twice concurrently commits once and refuses the second, and an addon can
 * never be bought for an outfit the character does not own.
 */
export async function deliverOutfit(
  context: StoreDeliveryContext,
  grant: {
    readonly kind: "outfit" | "outfit-addon";
    readonly male: number;
    readonly female: number;
    readonly addons: number;
  },
): Promise<StorePurchaseEffect> {
  const isMale = context.character.sex === 1;
  const lookType = isMale ? grant.male : grant.female;
  const other = isMale ? grant.female : grant.male;
  if (OUTFITS.get(lookType)?.sex !== (isMale ? "male" : "female")) {
    throw new TransactionRollback({ status: "wrong-sex" as const });
  }

  const owned = await context.client.query<{ addons: number }>(
    ownedOutfitQuery,
    [context.characterId, lookType],
  );
  const ownedAddons = owned.rows[0]?.addons;
  if (grant.kind === "outfit-addon" && ownedAddons === undefined) {
    throw new TransactionRollback({ status: "outfit-required" as const });
  }
  // Nothing new to grant means the purchase would charge for nothing.
  if (ownedAddons !== undefined && (grant.addons & ~ownedAddons) === 0) {
    throw new TransactionRollback({ status: "already-owned" as const });
  }

  await context.client.query(grantOutfitQuery, [
    context.characterId,
    lookType,
    grant.addons,
  ]);
  await context.client.query(grantOutfitQuery, [
    context.characterId,
    other,
    grant.addons,
  ]);
  return {
    kind: "outfit",
    lookType,
    addons: (ownedAddons ?? 0) | grant.addons,
  };
}
