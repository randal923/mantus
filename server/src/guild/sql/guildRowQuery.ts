export const guildRowQuery = `
  SELECT id, name, motd, owner_character_id FROM guilds WHERE id = $1`;
