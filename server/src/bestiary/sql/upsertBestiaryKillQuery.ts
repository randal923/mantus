export const upsertBestiaryKillQuery = `
  INSERT INTO character_bestiary_kills (character_id, race_id, kills)
  VALUES ($1, $2, $3)
  ON CONFLICT (character_id, race_id)
  DO UPDATE SET kills = character_bestiary_kills.kills + EXCLUDED.kills`;
