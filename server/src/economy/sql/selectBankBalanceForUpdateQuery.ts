export const selectBankBalanceForUpdateQuery =
  "SELECT balance FROM bank_accounts WHERE character_id = $1 FOR UPDATE";
