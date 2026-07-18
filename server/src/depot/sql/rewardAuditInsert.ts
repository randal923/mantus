export const rewardAuditInsert = `INSERT INTO audit_log(event_type, character_id, item_id, details)
         VALUES (
           'item-created', $1, $2,
           jsonb_build_object(
             'operation', 'reward-delivery', 'deliveryKey', $3::text,
             'itemTypeId', $4::integer, 'count', $5::integer
           )
         )`;
