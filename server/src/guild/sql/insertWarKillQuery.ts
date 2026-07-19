export const insertWarKillQuery = `
  INSERT INTO guild_war_kills (
    war_id, killer_character_id, target_character_id,
    killer_guild_id, target_guild_id
  ) VALUES ($1, $2, $3, $4, $5)`;
