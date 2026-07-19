/** The guild one character belongs to, if any. */
export const guildIdForCharacterQuery = `
  SELECT guild_id FROM guild_members WHERE character_id = $1`;
