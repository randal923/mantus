export const insertGuildhallQuery = `
  INSERT INTO houses (house_id, owner_character_id, guild_id, paid_until)
  VALUES ($1, $2, $3, $4)
  RETURNING tenancy_id`;
