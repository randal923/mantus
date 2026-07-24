export const insertDecayContentDestroyedAudit = `INSERT INTO audit_log(event_type, character_id, item_id, details)
         SELECT
           'item-destroyed', null, doomed.id,
           jsonb_build_object(
             'itemTypeId', doomed.item_type_id, 'count', doomed.count,
             'reason', 'decay'
           )
         FROM unnest($1::uuid[], $2::integer[], $3::integer[])
           AS doomed(id, item_type_id, count)`;
