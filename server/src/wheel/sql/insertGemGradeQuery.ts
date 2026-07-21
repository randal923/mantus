export const insertGemGradeQuery = `INSERT INTO character_gem_grades (character_id, mod_kind, mod_id, grade)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (character_id, mod_kind, mod_id) DO NOTHING`;
