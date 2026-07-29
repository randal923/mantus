import { TransactionRollback } from "../../economy/TransactionRollback";
import { MOUNTS } from "../../outfit/outfitCatalog";
import type { StorePurchaseEffect } from "../StorePurchaseEffect";
import type { StoreDeliveryContext } from "./StoreDeliveryContext";

const grantMountQuery = `INSERT INTO character_mounts (character_id, mount_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`;

/**
 * Grants one catalog mount. `ON CONFLICT DO NOTHING` plus the row count is
 * what makes "bought once" true: two purchases racing for the same mount
 * leave one insert and one refusal, so the loser is never charged.
 */
export async function deliverMount(
  context: StoreDeliveryContext,
  grant: { readonly mountId: number },
): Promise<StorePurchaseEffect> {
  if (!MOUNTS.has(grant.mountId)) {
    throw new TransactionRollback({ status: "offer-not-found" as const });
  }
  const granted = await context.client.query(grantMountQuery, [
    context.characterId,
    grant.mountId,
  ]);
  if (granted.rowCount !== 1) {
    throw new TransactionRollback({ status: "already-owned" as const });
  }
  return { kind: "mount", mountId: grant.mountId };
}
