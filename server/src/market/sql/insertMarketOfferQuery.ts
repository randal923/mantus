export const insertMarketOfferQuery = `INSERT INTO market_offers (
         character_id, account_id, side, item_type_id, amount,
         remaining_amount, unit_price, fee_paid, escrow_balance, expires_at
       ) VALUES (
         $1, $2, $3, $4, $5, $5, $6, $7, $8,
         now() + make_interval(days => $9)
       )
       RETURNING id, expires_at`;
