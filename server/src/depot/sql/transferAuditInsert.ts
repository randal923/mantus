export const transferAuditInsert = `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-transferred', $1, $2,
         jsonb_build_object(
           'operation', $3::text, 'before', $4::jsonb, 'after', $5::jsonb
         )
       )`;
