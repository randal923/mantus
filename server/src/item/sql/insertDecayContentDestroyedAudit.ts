export const insertDecayContentDestroyedAudit = `INSERT INTO audit_log(event_type, character_id, item_id, details)
         VALUES (
           'item-destroyed', null, $1,
           jsonb_build_object(
             'itemTypeId', $2::integer, 'count', $3::integer, 'reason', 'decay'
           )
         )`;
