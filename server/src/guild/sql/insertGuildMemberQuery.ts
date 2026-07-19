export const insertGuildMemberQuery = `
  INSERT INTO guild_members (character_id, guild_id, rank_id)
  VALUES ($1, $2, $3)`;
