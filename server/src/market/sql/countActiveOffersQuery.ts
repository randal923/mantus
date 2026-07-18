export const countActiveOffersQuery = `SELECT count(*)::int AS count FROM market_offers WHERE character_id = $1`;
