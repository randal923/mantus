export const insertShopStockQuery = `INSERT INTO shop_stock (
         shop_id, offer_id, initial_stock, remaining_stock
       ) VALUES ($1, $2, $3, $3)
       ON CONFLICT (shop_id, offer_id) DO NOTHING`;
