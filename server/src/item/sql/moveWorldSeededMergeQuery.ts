import { itemColumns } from "./itemColumns";

export const moveWorldSeededMergeQuery = `WITH moved AS (
             UPDATE items
             SET count = count + $2, world_x = $3, world_y = $4,
                 world_z = $5, world_stack_index = $6,
                 version = version + 1, updated_at = now()
             WHERE id = $1
             RETURNING ${itemColumns}
           ), audit_merge AS (
             INSERT INTO audit_log(event_type, character_id, item_id, details)
             SELECT 'item-merged', $7, moved.id,
               jsonb_build_object(
                 'sourceItemId', $8::text, 'movedCount', $2::integer,
                 'sourceRemaining', 0, 'resultCount', moved.count
               )
             FROM moved
           ), audit_transfer AS (
             INSERT INTO audit_log(event_type, character_id, item_id, details)
             SELECT 'item-transferred', $7, moved.id,
               jsonb_build_object(
                 'from', $9::jsonb,
                 'to', jsonb_build_object(
                   'kind', 'world', 'position', $10::jsonb,
                   'stackIndex', $6::integer
                 ),
                 'count', moved.count
               )
             FROM moved
           )
           SELECT ${itemColumns} FROM moved`;
