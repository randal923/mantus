import { itemColumns } from "./itemColumns";

export const moveContainerSplitQuery = `WITH source AS (
           UPDATE items
           SET count = count - $2, version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${itemColumns}
         ), created AS (
           INSERT INTO items (
             id, item_type_id, count, attributes, location_type,
             container_id, slot_index
           ) VALUES ($3, $4, $2, $5::jsonb, 'container', $6, $7)
           RETURNING ${itemColumns}
         ), audit AS (
           INSERT INTO audit_log(event_type, character_id, item_id, details)
           SELECT 'item-split', $8, source.id,
             jsonb_build_object(
               'originalCount', $9::integer, 'remainingCount', source.count,
               'createdItemId', created.id, 'createdCount', created.count,
               'destination', jsonb_build_object(
                 'kind', 'container', 'containerId', $6::text,
                 'slot', $7::integer
               )
             )
           FROM source, created
         )
         SELECT
           (SELECT row_to_json(source) FROM source) AS source,
           (SELECT row_to_json(created) FROM created) AS created`;
