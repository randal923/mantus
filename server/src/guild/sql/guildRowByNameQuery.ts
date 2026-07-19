/** Case-insensitive guild lookup on the normalized unique name. */
export const guildRowByNameQuery = `
  SELECT id, name, motd, owner_character_id
  FROM guilds
  WHERE lower(btrim(name)) = lower(btrim($1))`;
