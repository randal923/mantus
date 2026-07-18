export const extendOfferExpiryUpdate = `UPDATE market_offers
       SET expires_at = $2, updated_at = now()
       WHERE id = $1`;
