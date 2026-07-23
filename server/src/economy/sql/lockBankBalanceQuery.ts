export const lockBankBalanceQuery = `
  WITH inserted AS MATERIALIZED (
    INSERT INTO bank_accounts (character_id)
    VALUES ($1)
    ON CONFLICT (character_id) DO NOTHING
    RETURNING balance
  ),
  locked AS MATERIALIZED (
    SELECT balance
    FROM bank_accounts
    WHERE character_id = $1
    FOR UPDATE
  )
  SELECT balance FROM inserted
  UNION ALL
  SELECT balance FROM locked
  LIMIT 1`;
