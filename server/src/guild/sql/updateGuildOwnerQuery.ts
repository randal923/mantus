export const updateGuildOwnerQuery = `
  UPDATE guilds SET owner_character_id = $2 WHERE id = $1`;
