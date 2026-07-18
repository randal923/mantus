export const insertBankLedgerQuery = `INSERT INTO bank_ledger (
         character_id, entry_type, amount, balance_after,
         counterparty_character_id
       ) VALUES ($1, $2, $3, $4, $5)`;
