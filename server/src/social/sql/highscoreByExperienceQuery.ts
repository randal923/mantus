/** Staff accounts never appear on a board (Feature 66). */
export const highscoreByExperienceQuery = `
  SELECT c.display_name, c.level, c.vocation, c.experience::bigint AS value
  FROM characters c
  JOIN accounts a ON a.id = c.account_id
  WHERE NOT a.is_staff AND ($1::text IS NULL OR c.vocation = $1)
  ORDER BY c.experience DESC, c.normalized_name
  LIMIT $2 OFFSET $3`;
