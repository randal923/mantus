/** Joining a guild voids every other pending invitation for the character. */
export const deleteInvitesForCharacterQuery = `
  DELETE FROM guild_invites WHERE character_id = $1`;
