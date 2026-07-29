import { normalizeCharacterName } from "../../character/normalizeCharacterName";
import { isNormalizedNameConflict } from "../../character/isNormalizedNameConflict";
import { TransactionRollback } from "../../economy/TransactionRollback";
import type { StorePurchaseEffect } from "../StorePurchaseEffect";
import type { StoreDeliveryContext } from "./StoreDeliveryContext";

const renameQuery = `UPDATE characters
       SET display_name = $2, normalized_name = $3, updated_at = now()
       WHERE id = $1
       RETURNING display_name`;

/**
 * Canary's name change. The new name goes through the same normalisation and
 * reserved-word rules character creation uses, so the store cannot be a back
 * door to a name creation would refuse.
 *
 * Uniqueness is the database's `characters_normalized_name_key`, not a
 * read-then-write check: two players buying the same name concurrently leave
 * exactly one rename, and the loser's coins roll back with the constraint
 * violation (charter rule 3).
 */
export async function deliverNameChange(
  context: StoreDeliveryContext,
): Promise<StorePurchaseEffect> {
  if (context.newName === undefined) {
    throw new TransactionRollback({ status: "name-required" as const });
  }
  const normalized = normalizeCharacterName(context.newName);
  if (!normalized) {
    throw new TransactionRollback({ status: "name-invalid" as const });
  }
  if (normalized.normalizedName === context.character.display_name.toLowerCase()) {
    throw new TransactionRollback({ status: "name-taken" as const });
  }

  try {
    const renamed = await context.client.query<{ display_name: string }>(
      renameQuery,
      [context.characterId, normalized.displayName, normalized.normalizedName],
    );
    const displayName = renamed.rows[0]?.display_name;
    if (displayName === undefined) {
      throw new TransactionRollback({ status: "failed" as const });
    }
    return { kind: "name-change", displayName };
  } catch (cause) {
    if (isNormalizedNameConflict(cause)) {
      throw new TransactionRollback({ status: "name-taken" as const });
    }
    throw cause;
  }
}
