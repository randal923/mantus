export const insertItemSplitAudit = `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES ('item-split', $1, $2, $3::jsonb)`;
