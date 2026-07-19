export const updateMemberRankQuery = `
  UPDATE guild_members SET rank_id = $2 WHERE character_id = $1`;
