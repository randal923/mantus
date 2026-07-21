export const selectGemGradesQuery = `SELECT mod_kind, mod_id, grade
       FROM character_gem_grades WHERE character_id = $1`;
