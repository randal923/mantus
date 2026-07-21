export const insertGemAuditQuery = `INSERT INTO audit_log (event_type, character_id, details)
       VALUES ($2, $1, $3::jsonb)`;
