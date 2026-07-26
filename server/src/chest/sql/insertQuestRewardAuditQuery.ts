export const insertQuestRewardAuditQuery = `INSERT INTO audit_log (event_type, character_id, details)
       VALUES ('quest-reward', $1, $2::jsonb)`;
