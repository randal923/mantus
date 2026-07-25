/** Count for character-table categories, capped at the ranking depth. */
export const countHighscoreCharactersQuery = `
  SELECT count(*)::int AS total FROM (
    SELECT 1 FROM characters c
    JOIN accounts a ON a.id = c.account_id
    WHERE NOT a.is_staff AND ($1::text IS NULL OR c.vocation = $1)
    LIMIT $2
  ) bounded`;
