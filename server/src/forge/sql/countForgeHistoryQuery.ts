export const countForgeHistoryQuery = `SELECT count(*)::int AS total
       FROM forge_history
       WHERE character_id = $1`;
