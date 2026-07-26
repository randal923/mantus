export const selectTrackersQuery = `SELECT scope, race_id
       FROM character_monster_trackers
       WHERE character_id = $1`;
