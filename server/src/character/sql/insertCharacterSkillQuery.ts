export const insertCharacterSkillQuery = `INSERT INTO character_skills (character_id, skill, level, tries)
         VALUES ($1, $2, $3, $4)`;
