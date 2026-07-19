export const insertGuildRankQuery = `
  INSERT INTO guild_ranks (guild_id, level, name)
  VALUES ($1, $2, $3)
  RETURNING id`;
