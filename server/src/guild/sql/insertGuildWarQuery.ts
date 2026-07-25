export const insertGuildWarQuery = `
  INSERT INTO guild_wars (guild1_id, guild2_id, frag_limit, payment)
  VALUES ($1, $2, $3, $4)
  RETURNING id`;
