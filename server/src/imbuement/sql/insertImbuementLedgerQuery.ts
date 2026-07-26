export const insertImbuementLedgerQuery = `INSERT INTO bank_ledger (
         character_id, entry_type, amount, balance_after
       ) VALUES ($1, 'imbuement', $2, $3)`;
