export const insertItemCreatedAuditQuery = `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-created', $1, $2,
         jsonb_build_object(
           'itemTypeId', $3::integer, 'count', $4::integer, 'reason', $5::text
         )
       )`;
