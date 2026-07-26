export const deleteTrackerQuery = `DELETE FROM character_monster_trackers
       WHERE character_id = $1 AND scope = $2 AND race_id = $3`;
