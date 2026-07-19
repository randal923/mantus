export const upsertAccountBanQuery = `
  INSERT INTO account_bans (account_id, reason, expires_at, banned_by_character_id)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (account_id) DO UPDATE
  SET reason = excluded.reason,
      banned_at = now(),
      expires_at = excluded.expires_at,
      banned_by_character_id = excluded.banned_by_character_id`;
