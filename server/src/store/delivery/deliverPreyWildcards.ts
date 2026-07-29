import { PREY_RULES } from "@tibia/protocol";
import { TransactionRollback } from "../../economy/TransactionRollback";
import { grantWildcardsQuery } from "../../prey/sql/grantWildcardsQuery";
import { insertPreyResourcesRowQuery } from "../../prey/sql/insertPreyResourcesRowQuery";
import type { StorePurchaseEffect } from "../StorePurchaseEffect";
import type { StoreDeliveryContext } from "./StoreDeliveryContext";

const lockWildcardsQuery = `SELECT wildcards::text AS wildcards
       FROM character_prey_resources
       WHERE character_id = $1
       FOR UPDATE`;

/**
 * Credits prey wildcards, capped exactly as Canary caps them. The cap is
 * applied by the UPDATE itself (`LEAST(cap, wildcards + n)`), so two
 * concurrent purchases cannot push the balance past it — but a purchase that
 * would grant *nothing* because the balance is already at the cap is refused
 * rather than charged.
 */
export async function deliverPreyWildcards(
  context: StoreDeliveryContext,
  grant: { readonly count: number },
): Promise<StorePurchaseEffect> {
  await context.client.query(insertPreyResourcesRowQuery, [context.characterId]);
  const locked = await context.client.query<{ wildcards: string }>(
    lockWildcardsQuery,
    [context.characterId],
  );
  const before = Number(locked.rows[0]?.wildcards ?? 0);
  if (before >= PREY_RULES.maxWildcards) {
    throw new TransactionRollback({ status: "limit-reached" as const });
  }
  const granted = await context.client.query<{ wildcards: string }>(
    grantWildcardsQuery,
    [context.characterId, grant.count, PREY_RULES.maxWildcards],
  );
  return {
    kind: "prey-wildcard",
    balance: Number(granted.rows[0]?.wildcards ?? before),
  };
}
