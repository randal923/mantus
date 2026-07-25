/**
 * Appends one coin-ledger row. `ON CONFLICT DO NOTHING` covers the unique
 * request-key and refunded-entry indexes, so a racing duplicate reports zero
 * rows instead of raising — the caller turns that into "already applied".
 */
export const coinLedgerInsert = `INSERT INTO mantus_coin_ledger (
         account_id, entry_type, amount, balance_after, offer_id,
         request_key, refunded_entry_id, operator_character_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`;
