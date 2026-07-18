export const sellOffersForTypeQuery = `SELECT id, character_id, side, remaining_amount, unit_price, expires_at
       FROM market_offers
       WHERE item_type_id = $1 AND side = 'sell' AND expires_at > now()
       ORDER BY unit_price ASC, created_at ASC
       LIMIT $2`;
