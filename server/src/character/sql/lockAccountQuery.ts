export const lockAccountQuery =
  "SELECT id FROM accounts WHERE id = $1 FOR UPDATE";
