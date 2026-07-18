export const insertMarketHistoryQuery = `INSERT INTO market_history (
         offer_id, character_id, role, side, item_type_id, amount,
         unit_price, state
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
