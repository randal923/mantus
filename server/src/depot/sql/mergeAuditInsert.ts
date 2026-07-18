export const mergeAuditInsert = `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-merged', $1, $2,
         jsonb_build_object(
           'sourceItemId', $3::text, 'movedCount', $4::integer,
           'sourceRemaining', $5::integer, 'resultCount', $6::integer,
           'operation', $7::text
         )
       )`;
