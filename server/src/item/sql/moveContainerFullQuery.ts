import { itemColumns } from "./itemColumns";

export const moveContainerFullQuery = `WITH moved AS (
             UPDATE items
             SET location_type = 'container', character_id = null,
                 equipment_slot = null, container_id = $2, slot_index = $3,
                 version = version + 1, updated_at = now()
             WHERE id = $1
             RETURNING ${itemColumns}
           ), audit AS (
             INSERT INTO audit_log(event_type, character_id, item_id, details)
             SELECT 'item-transferred', $4, moved.id,
               jsonb_build_object(
                 'from', $5::jsonb,
                 'to', jsonb_build_object(
                   'kind', 'container', 'containerId', $2::text,
                   'slot', $3::integer
                 ),
                 'count', moved.count
               )
             FROM moved
           )
           SELECT ${itemColumns} FROM moved`;
