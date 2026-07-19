export const highscoreByMagicQuery = `
  SELECT display_name, level, vocation, magic_level::bigint AS value
  FROM characters
  WHERE $1::text IS NULL OR vocation = $1
  ORDER BY magic_level DESC, mana_spent DESC, normalized_name
  LIMIT $2 OFFSET $3`;
