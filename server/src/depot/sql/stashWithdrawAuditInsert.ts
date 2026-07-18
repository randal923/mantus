export const stashWithdrawAuditInsert = `INSERT INTO audit_log(event_type, character_id, item_id, details)
           VALUES (
             'item-created', $1, $2,
             jsonb_build_object(
               'operation', 'stash-withdrawal', 'itemTypeId', $3::integer,
               'count', $4::integer
             )
           )`;
