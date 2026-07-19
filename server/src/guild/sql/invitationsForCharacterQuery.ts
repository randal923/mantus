export const invitationsForCharacterQuery = `
  SELECT gi.guild_id, g.name AS guild_name, c.display_name AS inviter_name
  FROM guild_invites gi
  JOIN guilds g ON g.id = gi.guild_id
  JOIN characters c ON c.id = gi.invited_by_character_id
  WHERE gi.character_id = $1
  ORDER BY gi.created_at
  LIMIT 100`;
