export const updateShopStockQuery = `UPDATE shop_stock
       SET remaining_stock = $3, version = version + 1, updated_at = now()
       WHERE shop_id = $1 AND offer_id = $2`;
