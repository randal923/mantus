export const deleteAccountBanQuery = `
  DELETE FROM account_bans WHERE account_id = $1`;
