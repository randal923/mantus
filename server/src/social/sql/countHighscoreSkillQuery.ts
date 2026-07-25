/** Count for skill categories, capped at the ranking depth. */
export const countHighscoreSkillQuery = `
  SELECT count(*)::int AS total FROM (
    SELECT 1 FROM character_skills s
    JOIN characters c ON c.id = s.character_id
    JOIN accounts a ON a.id = c.account_id
    WHERE NOT a.is_staff
      AND s.skill = $1 AND ($2::text IS NULL OR c.vocation = $2)
    LIMIT $3
  ) bounded`;
