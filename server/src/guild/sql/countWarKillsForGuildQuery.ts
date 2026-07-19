export const countWarKillsForGuildQuery = `
  SELECT count(*)::int AS total
  FROM guild_war_kills
  WHERE war_id = $1 AND killer_guild_id = $2`;
