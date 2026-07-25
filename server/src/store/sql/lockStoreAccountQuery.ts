export const lockStoreAccountQuery = `SELECT mantus_coins, premium_until,
         CURRENT_TIMESTAMP AS transaction_now
       FROM accounts
       WHERE id = $1
       FOR UPDATE`;
