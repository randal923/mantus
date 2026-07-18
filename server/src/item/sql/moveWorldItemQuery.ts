import { itemColumns } from "./itemColumns";

export const moveWorldItemQuery = `WITH moved AS (
           UPDATE items
           SET world_x = $2, world_y = $3, world_z = $4,
               world_stack_index = $5, version = version + 1,
               updated_at = now()
           WHERE id = $1
           RETURNING ${itemColumns}
         ), audit AS (
           INSERT INTO audit_log(event_type, character_id, item_id, details)
           SELECT 'item-transferred', $6, moved.id,
             jsonb_build_object(
               'from', $7::jsonb,
               'to', jsonb_build_object(
                 'kind', 'world', 'position', $8::jsonb,
                 'stackIndex', $5::integer
               ),
               'count', moved.count
             )
           FROM moved
         )
         SELECT ${itemColumns} FROM moved`;
