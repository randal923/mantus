export const expiredOfferIdsQuery = `SELECT id
       FROM market_offers
       WHERE expires_at <= $1
       ORDER BY expires_at ASC
       LIMIT $2`;
