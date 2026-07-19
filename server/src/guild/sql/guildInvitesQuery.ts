export const guildInvitesQuery = `
  SELECT gi.character_id, c.display_name AS name
  FROM guild_invites gi
  JOIN characters c ON c.id = gi.character_id
  WHERE gi.guild_id = $1
  ORDER BY gi.created_at
  LIMIT 100`;
