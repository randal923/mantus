export const updateGemGradeQuery = `UPDATE character_gem_grades
       SET grade = $4, updated_at = now()
       WHERE character_id = $1 AND mod_kind = $2 AND mod_id = $3
         AND grade = $4 - 1`;
