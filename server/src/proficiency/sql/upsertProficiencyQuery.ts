export const upsertProficiencyQuery = `INSERT INTO character_weapon_proficiencies (
         character_id, proficiency_id, experience, mastered, selections
       ) VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (character_id, proficiency_id) DO UPDATE
       SET experience = GREATEST(character_weapon_proficiencies.experience, $3),
           mastered = character_weapon_proficiencies.mastered OR $4,
           selections = $5::jsonb`;
