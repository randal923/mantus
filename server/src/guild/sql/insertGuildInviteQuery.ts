export const insertGuildInviteQuery = `
  INSERT INTO guild_invites (character_id, guild_id, invited_by_character_id)
  VALUES ($1, $2, $3)`;
