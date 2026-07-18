export const insertItemWrittenAudit = `INSERT INTO audit_log(event_type, character_id, item_id, details)
         VALUES (
           'item-written', $1, $2,
           jsonb_build_object(
             'previousLength', $3::integer, 'length', $4::integer
           )
         )`;
