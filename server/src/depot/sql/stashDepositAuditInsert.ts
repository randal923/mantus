export const stashDepositAuditInsert = `INSERT INTO audit_log(event_type, character_id, item_id, details)
         VALUES (
           'item-transferred', $1, $2,
           jsonb_build_object(
             'operation', 'stash-deposit', 'itemTypeId', $3::integer,
             'count', $4::integer
           )
         )`;
