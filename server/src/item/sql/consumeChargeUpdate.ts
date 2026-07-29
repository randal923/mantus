import { itemColumns } from "./itemColumns";

/**
 * Writes the remaining charges of a charged item. The caller reads the current
 * total under the row lock inside the same transaction, so the new value can
 * never be derived from a stale read.
 */
export const consumeChargeUpdate = `UPDATE items
         SET attributes = jsonb_set(
               attributes, '{charges}', to_jsonb($2::integer), true
             ),
             version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${itemColumns}`;
