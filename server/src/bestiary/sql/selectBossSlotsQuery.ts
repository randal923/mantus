export const selectBossSlotsQuery = `SELECT slot_one_race_id, slot_two_race_id, remove_count
       FROM character_boss_slots
       WHERE character_id = $1`;
