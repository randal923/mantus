export const insertHouseAuditQuery = `INSERT INTO audit_log(event_type, character_id, details)
       VALUES ($1, $2, $3::jsonb)`;
