export const guildMembersQuery = `
  SELECT gm.character_id, c.display_name AS name, gr.level AS rank_level, gm.nick
  FROM guild_members gm
  JOIN characters c ON c.id = gm.character_id
  JOIN guild_ranks gr ON gr.id = gm.rank_id
  WHERE gm.guild_id = $1
  ORDER BY gr.level DESC, c.display_name
  LIMIT 500`;
