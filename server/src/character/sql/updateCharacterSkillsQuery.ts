export const updateCharacterSkillsQuery = `UPDATE character_skills AS saved
  SET level = incoming.level,
      tries = incoming.tries
  FROM unnest(
    $2::text[],
    $3::smallint[],
    $4::bigint[]
  ) AS incoming(skill, level, tries)
  WHERE saved.character_id = $1
    AND saved.skill = incoming.skill
  RETURNING saved.skill`;
