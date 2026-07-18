import { itemColumns } from "./itemColumns";

export const moveContainerSeededMergeQuery = `WITH moved AS (
               UPDATE items
               SET count = count + $2, location_type = 'container',
                   character_id = null, equipment_slot = null,
                   container_id = $3, slot_index = $4,
                   version = version + 1, updated_at = now()
               WHERE id = $1
               RETURNING ${itemColumns}
             ), audit_merge AS (
               INSERT INTO audit_log(event_type, character_id, item_id, details)
               SELECT 'item-merged', $5, moved.id,
                 jsonb_build_object(
                   'sourceItemId', $6::text, 'movedCount', $2::integer,
                   'sourceRemaining', 0, 'resultCount', moved.count
                 )
               FROM moved
             ), audit_transfer AS (
               INSERT INTO audit_log(event_type, character_id, item_id, details)
               SELECT 'item-transferred', $5, moved.id,
                 jsonb_build_object(
                   'from', $7::jsonb,
                   'to', jsonb_build_object(
                     'kind', 'container', 'containerId', $3::text,
                     'slot', $4::integer
                   ),
                   'count', moved.count
                 )
               FROM moved
             )
             SELECT ${itemColumns} FROM moved`;
