export const characterMuteQuery = `
  SELECT muted_until, reason FROM character_mutes
  WHERE character_id = $1`;
