export const highscoreByExperienceQuery = `
  SELECT display_name, level, vocation, experience::bigint AS value
  FROM characters
  WHERE $1::text IS NULL OR vocation = $1
  ORDER BY experience DESC, normalized_name
  LIMIT $2 OFFSET $3`;
