export const selectProficienciesQuery = `SELECT proficiency_id, experience, mastered, selections
       FROM character_weapon_proficiencies
       WHERE character_id = $1`;
