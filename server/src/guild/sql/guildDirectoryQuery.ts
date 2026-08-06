/** Alphabetical public guild directory with member counts. */
export const guildDirectoryQuery = `
  SELECT g.name, g.motd, g.level, g.created_at,
         count(gm.character_id)::int AS member_count
  FROM guilds g
  LEFT JOIN guild_members gm ON gm.guild_id = g.id
  GROUP BY g.id
  ORDER BY lower(btrim(g.name))
  LIMIT 500`;
