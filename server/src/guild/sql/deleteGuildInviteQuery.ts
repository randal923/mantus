export const deleteGuildInviteQuery = `
  DELETE FROM guild_invites
  WHERE character_id = $1 AND guild_id = $2`;
