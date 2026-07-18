export const insertItemTransferredAudit = `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES ('item-transferred', $1, $2, $3::jsonb)`;
