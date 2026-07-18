export const insertShopPurchaseLedgerQuery = `INSERT INTO bank_ledger (
             character_id, entry_type, amount, balance_after
           ) VALUES ($1, 'shop-purchase', $2, $3)`;
