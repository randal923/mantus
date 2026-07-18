export const debitBankBalanceQuery = `UPDATE bank_accounts
       SET balance = balance - $2, version = version + 1, updated_at = now()
       WHERE character_id = $1 AND balance >= $2
       RETURNING balance`;
