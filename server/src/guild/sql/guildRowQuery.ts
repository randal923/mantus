export const guildRowQuery = `
  SELECT id, name, motd, owner_character_id,
         balance::text AS balance, points::text AS points, level
  FROM guilds WHERE id = $1`;
