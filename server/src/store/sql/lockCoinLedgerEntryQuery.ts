export const lockCoinLedgerEntryQuery = `SELECT id, account_id, entry_type, amount, offer_id
       FROM mantus_coin_ledger
       WHERE id = $1
       FOR UPDATE`;
