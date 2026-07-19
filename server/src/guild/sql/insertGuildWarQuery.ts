export const insertGuildWarQuery = `
  INSERT INTO guild_wars (guild1_id, guild2_id, frag_limit)
  VALUES ($1, $2, $3)
  RETURNING id`;
