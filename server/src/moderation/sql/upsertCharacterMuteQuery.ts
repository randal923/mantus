export const upsertCharacterMuteQuery = `
  INSERT INTO character_mutes (character_id, muted_until, reason)
  VALUES ($1, $2, $3)
  ON CONFLICT (character_id) DO UPDATE
  SET muted_until = excluded.muted_until, reason = excluded.reason`;
