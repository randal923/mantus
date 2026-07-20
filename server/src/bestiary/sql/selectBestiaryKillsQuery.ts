export const selectBestiaryKillsQuery = `
  SELECT race_id, kills::bigint AS kills
  FROM character_bestiary_kills
  WHERE character_id = $1`;
