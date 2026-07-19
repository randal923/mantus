export const guildRanksQuery = `
  SELECT id, level, name FROM guild_ranks
  WHERE guild_id = $1
  ORDER BY level DESC`;
