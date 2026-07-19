export const updateAccountBannedUntilQuery = `
  UPDATE accounts SET banned_until = $2 WHERE id = $1`;
