import { itemColumns } from "./itemColumns";

export const decayTransformUpdate = `UPDATE items
         SET item_type_id = $2, attributes = '{}'::jsonb,
             version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${itemColumns}`;
