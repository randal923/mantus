export const debitShopBankWithLedgerQuery = `
  WITH debited AS (
    UPDATE bank_accounts
    SET balance = balance - $2, version = version + 1, updated_at = now()
    WHERE character_id = $1 AND balance >= $2
    RETURNING character_id, balance
  ),
  ledger AS (
    INSERT INTO bank_ledger (
      character_id, entry_type, amount, balance_after
    )
    SELECT character_id, 'shop-purchase', $2, balance
    FROM debited
    RETURNING character_id
  )
  SELECT debited.balance
  FROM debited
  JOIN ledger USING (character_id)`;
