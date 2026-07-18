export const updateCharacterSkillQuery = `UPDATE character_skills
           SET level = $3, tries = $4
           WHERE character_id = $1 AND skill = $2`;
