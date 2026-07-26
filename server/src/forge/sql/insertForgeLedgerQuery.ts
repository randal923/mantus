export const insertForgeLedgerQuery = `INSERT INTO bank_ledger (
         character_id, entry_type, amount, balance_after
       ) VALUES ($1, 'forge', $2, $3)`;
