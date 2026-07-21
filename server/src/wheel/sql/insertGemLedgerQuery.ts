export const insertGemLedgerQuery = `INSERT INTO bank_ledger (
         character_id, entry_type, amount, balance_after
       ) VALUES ($1, 'gem-atelier', $2, $3)`;
