export const lockBankAccountPairQuery = `SELECT character_id, balance FROM bank_accounts
         WHERE character_id IN ($1, $2)
         ORDER BY character_id
         FOR UPDATE`;
