export const insertItemTransformedAudit = `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-transformed', $1, $2,
         jsonb_build_object('fromTypeId', $3::integer, 'toTypeId', $4::integer)
       )`;
