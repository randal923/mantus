export const lockMarketOfferQuery = `SELECT id, character_id, account_id, side, item_type_id, amount,
              remaining_amount, unit_price, fee_paid, escrow_balance, version,
              created_at, expires_at
       FROM market_offers
       WHERE id = $1
       FOR UPDATE`;
