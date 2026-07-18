export const insertLootCreatedAudit = `INSERT INTO audit_log(event_type, character_id, item_id, details)
           VALUES (
             'item-created', $1, $2,
             jsonb_build_object(
               'eventId', $3::text, 'itemTypeId', $4::integer,
               'count', $5::integer, 'reason', 'monster-loot'
             )
           )`;
