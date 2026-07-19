export const insertModerationActionQuery = `
  INSERT INTO moderation_actions (
    action, target_character_id, issued_by_character_id,
    reason, duration_ms, expires_at
  ) VALUES ($1, $2, $3, $4, $5, $6)`;
