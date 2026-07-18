import { itemColumns } from "./itemColumns";

export const moveContainerMergePartialQuery = `WITH merged AS (
             UPDATE items
             SET count = count + $2, version = version + 1, updated_at = now()
             WHERE id = $1
             RETURNING ${itemColumns}
           ), source AS (
             UPDATE items
             SET count = count - $2, version = version + 1, updated_at = now()
             WHERE id = $3
             RETURNING ${itemColumns}
           ), audit AS (
             INSERT INTO audit_log(event_type, character_id, item_id, details)
             SELECT 'item-merged', $4, merged.id,
               jsonb_build_object(
                 'sourceItemId', $3::text, 'movedCount', $2::integer,
                 'sourceRemaining', source.count, 'resultCount', merged.count
               )
             FROM merged, source
           )
           SELECT
             (SELECT row_to_json(merged) FROM merged) AS merged,
             (SELECT row_to_json(source) FROM source) AS source`;
