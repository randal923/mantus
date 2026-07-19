/** Count for character-table categories, capped at the ranking depth. */
export const countHighscoreCharactersQuery = `
  SELECT count(*)::int AS total FROM (
    SELECT 1 FROM characters
    WHERE $1::text IS NULL OR vocation = $1
    LIMIT $2
  ) bounded`;
