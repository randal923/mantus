export const insertBossSlotLedgerQuery = `INSERT INTO bank_ledger (
         character_id, entry_type, amount, balance_after
       ) VALUES ($1, 'boss-slot-remove', $2, $3)`;
