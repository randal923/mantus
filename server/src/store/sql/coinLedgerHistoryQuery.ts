/** The account's own ledger, newest first. Bounded by the caller. */
export const coinLedgerHistoryQuery = `SELECT id, entry_type, amount, balance_after, offer_id, occurred_at
       FROM mantus_coin_ledger
       WHERE account_id = $1
       ORDER BY id DESC
       LIMIT $2`;
