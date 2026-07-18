import { itemColumns } from "./itemColumns";

export const moveWorldMergeQuery = `WITH merged AS (
             UPDATE items
             SET count = count + $2, version = version + 1, updated_at = now()
             WHERE id = $1
             RETURNING ${itemColumns}
           ), removed AS (
             DELETE FROM items WHERE id = $3
           ), audit AS (
             INSERT INTO audit_log(event_type, character_id, item_id, details)
             SELECT 'item-merged', $4, merged.id,
               jsonb_build_object(
                 'sourceItemId', $3::text, 'movedCount', $2::integer,
                 'sourceRemaining', 0, 'resultCount', merged.count
               )
             FROM merged
           )
           SELECT ${itemColumns} FROM merged`;
