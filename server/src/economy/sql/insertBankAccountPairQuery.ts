export const insertBankAccountPairQuery = `INSERT INTO bank_accounts (character_id)
         VALUES ($1), ($2)
         ON CONFLICT (character_id) DO NOTHING`;
