import { itemColumns } from "./itemColumns";

export const lockContainerMergeTargetQuery = `SELECT ${itemColumns}
       FROM items
       WHERE container_id = $1 AND location_type = 'container'
         AND item_type_id = $2 AND attributes = $3::jsonb
         AND seed_key IS NULL
         AND count + $4 <= $5
         AND id <> $6
       ORDER BY slot_index
       LIMIT 1
       FOR UPDATE`;
