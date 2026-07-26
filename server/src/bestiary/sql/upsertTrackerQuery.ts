export const upsertTrackerQuery = `INSERT INTO character_monster_trackers (character_id, scope, race_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (character_id, scope, race_id) DO NOTHING`;
