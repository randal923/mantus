export const ownOffersQuery = `SELECT id, side, item_type_id, remaining_amount, unit_price, expires_at
       FROM market_offers
       WHERE character_id = $1
       ORDER BY created_at DESC
       LIMIT $2`;
