import { itemColumns } from "./itemColumns";

export const conjureTransformSourceUpdate = `UPDATE items
           SET item_type_id = $2, count = $3, attributes = '{}'::jsonb,
               version = version + 1, seed_key = null,
               seed_map_name = null, seed_map_version = null,
               seed_x = null, seed_y = null, seed_z = null,
               seed_stack_index = null, updated_at = now()
           WHERE id = $1
           RETURNING ${itemColumns}`;
