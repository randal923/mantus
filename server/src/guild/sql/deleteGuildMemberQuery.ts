export const deleteGuildMemberQuery = `
  DELETE FROM guild_members
  WHERE character_id = $1 AND guild_id = $2`;
