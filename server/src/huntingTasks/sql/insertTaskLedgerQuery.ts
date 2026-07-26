export const insertTaskLedgerQuery = `INSERT INTO bank_ledger (
         character_id, entry_type, amount, balance_after
       ) VALUES ($1, $2, $3, $4)`;
