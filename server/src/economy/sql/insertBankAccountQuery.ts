export const insertBankAccountQuery = `INSERT INTO bank_accounts (character_id)
       VALUES ($1)
       ON CONFLICT (character_id) DO NOTHING`;
