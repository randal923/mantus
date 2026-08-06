/** Case-insensitive public guild lookup on the normalized unique name. */
export const publicGuildRowByNameQuery = `
  SELECT id, name, motd, level, created_at
  FROM guilds
  WHERE lower(btrim(name)) = lower(btrim($1))`;
