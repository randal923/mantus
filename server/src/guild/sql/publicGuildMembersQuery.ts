/** Public roster rows; namelocked characters stay hidden (profile parity). */
export const publicGuildMembersQuery = `
  SELECT gm.character_id, c.display_name AS name, gm.nick, gm.joined_at,
         gr.level AS rank_level, gr.name AS rank_name, c.vocation, c.level
  FROM guild_members gm
  JOIN characters c ON c.id = gm.character_id
  JOIN guild_ranks gr ON gr.id = gm.rank_id
  WHERE gm.guild_id = $1 AND c.namelocked = false
  ORDER BY gr.level DESC, lower(c.display_name)
  LIMIT 500`;
