export const insertDecayTransformAudit = `INSERT INTO audit_log(event_type, character_id, item_id, details)
         VALUES (
           'item-transformed', null, $1,
           jsonb_build_object(
             'reason', 'decay',
             'fromTypeId', $2::integer, 'toTypeId', $3::integer
           )
         )`;
