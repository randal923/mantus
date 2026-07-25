/**
 * Ledger rows whose recorded balance step does not equal the amount they
 * claim to move. Deliberately sign-agnostic — the entry-type list grows with
 * every economy feature, and comparing magnitudes catches a forged or
 * mis-signed row without this query needing to know each type's direction.
 */
export const bankLedgerBreakQuery = `
  SELECT id, character_id, entry_type, amount, balance_before, balance_after
  FROM (
    SELECT
      id,
      character_id,
      entry_type,
      amount,
      balance_after,
      coalesce(
        lag(balance_after) OVER (PARTITION BY character_id ORDER BY id),
        0
      ) AS balance_before
    FROM bank_ledger
  ) AS chained
  WHERE abs(balance_after - balance_before) <> amount
  ORDER BY id
  LIMIT $1`;
