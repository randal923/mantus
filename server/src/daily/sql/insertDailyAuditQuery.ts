export const insertDailyAuditQuery = `INSERT INTO audit_log (event_type, character_id, details)
       VALUES ('daily-reward-claim', $1, $2::jsonb)`;
