export const deleteMarketEscrowItemQuery = `DELETE FROM market_escrow_items WHERE item_id = ANY($1::uuid[])`;
