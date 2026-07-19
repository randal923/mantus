export const highscoreBySkillQuery = `
  SELECT c.display_name, c.level, c.vocation, s.level::bigint AS value
  FROM character_skills s
  JOIN characters c ON c.id = s.character_id
  WHERE s.skill = $1 AND ($2::text IS NULL OR c.vocation = $2)
  ORDER BY s.level DESC, s.tries DESC, c.normalized_name
  LIMIT $3 OFFSET $4`;
