export const rankIdByLevelQuery = `
  SELECT id FROM guild_ranks WHERE guild_id = $1 AND level = $2`;
