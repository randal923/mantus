export const upsertBossSlotsQuery = `INSERT INTO character_boss_slots (
         character_id, slot_one_race_id, slot_two_race_id, remove_count
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (character_id) DO UPDATE
       SET slot_one_race_id = $2, slot_two_race_id = $3, remove_count = $4`;
