import { itemColumns } from "./itemColumns";

export const writeTextUpdate = `UPDATE items
         SET attributes = jsonb_set(
               attributes, '{text}', to_jsonb($2::text), true
             ),
             version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${itemColumns}`;
