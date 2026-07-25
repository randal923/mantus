/**
 * Accounts whose stored balance disagrees with the running total their ledger
 * records. Every balance change is supposed to append a `bank_ledger` row
 * carrying the post-change balance in the same transaction, so a mismatch
 * means a balance moved without an entry — exactly what the audit trail
 * exists to make impossible.
 */
export const bankLedgerDriftQuery = `
  SELECT
    accounts.character_id,
    accounts.balance,
    coalesce(latest.balance_after, 0) AS ledger_balance
  FROM bank_accounts AS accounts
  LEFT JOIN LATERAL (
    SELECT balance_after
    FROM bank_ledger
    WHERE character_id = accounts.character_id
    ORDER BY id DESC
    LIMIT 1
  ) AS latest ON true
  WHERE accounts.balance <> coalesce(latest.balance_after, 0)
  ORDER BY accounts.character_id
  LIMIT $1`;
