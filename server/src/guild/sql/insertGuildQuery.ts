export const insertGuildQuery = `
  INSERT INTO guilds (name, owner_character_id)
  VALUES ($1, $2)
  RETURNING id`;
