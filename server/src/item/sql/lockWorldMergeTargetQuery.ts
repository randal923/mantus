import { itemColumns } from "./itemColumns";

export const lockWorldMergeTargetQuery = `SELECT ${itemColumns}
       FROM items
       WHERE location_type = 'world' AND world_map_name = $1
         AND world_x = $2 AND world_y = $3 AND world_z = $4
         AND item_type_id = $5 AND attributes = $6::jsonb
         AND seed_key IS NULL AND count + $7 <= $8
       ORDER BY world_stack_index
       LIMIT 1
       FOR UPDATE`;
