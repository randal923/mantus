export const lockShopStockQuery = `SELECT initial_stock, remaining_stock FROM shop_stock
       WHERE shop_id = $1 AND offer_id = $2
       FOR UPDATE`;
