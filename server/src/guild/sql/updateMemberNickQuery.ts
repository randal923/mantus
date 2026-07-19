export const updateMemberNickQuery = `
  UPDATE guild_members SET nick = $2 WHERE character_id = $1`;
