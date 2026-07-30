/** Every finite-stock offer's durable counters, read once to seed the cache. */
export const readShopStockQuery = `
  SELECT shop_id, offer_id, initial_stock, remaining_stock
  FROM shop_stock`;
