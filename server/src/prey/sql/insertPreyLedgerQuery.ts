export const insertPreyLedgerQuery = `INSERT INTO bank_ledger (
         character_id, entry_type, amount, balance_after
       ) VALUES ($1, 'prey-reroll', $2, $3)`;
