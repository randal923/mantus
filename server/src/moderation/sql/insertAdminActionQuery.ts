/**
 * Admin actions beyond moderation (teleport, inspection) share the
 * `moderation_actions` trail so there is one place to answer "what did staff
 * do". `detail` carries the before/after state those actions need and
 * `duration_ms`/`expires_at` cannot express.
 */
export const insertAdminActionQuery = `
  INSERT INTO moderation_actions (
    action, target_character_id, issued_by_character_id, reason, detail
  ) VALUES ($1, $2, $3, $4, $5)`;
