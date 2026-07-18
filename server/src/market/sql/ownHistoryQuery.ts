export const ownHistoryQuery = `SELECT side, item_type_id, amount, unit_price, state, occurred_at
       FROM market_history
       WHERE character_id = $1
       ORDER BY occurred_at DESC, id DESC
       LIMIT $2`;
