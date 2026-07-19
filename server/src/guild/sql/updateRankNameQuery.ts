export const updateRankNameQuery = `
  UPDATE guild_ranks SET name = $3 WHERE guild_id = $1 AND level = $2`;
