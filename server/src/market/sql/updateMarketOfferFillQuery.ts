export const updateMarketOfferFillQuery = `UPDATE market_offers
       SET remaining_amount = remaining_amount - $2,
           escrow_balance = escrow_balance - $3,
           version = version + 1, updated_at = now()
       WHERE id = $1 AND remaining_amount > $2 AND escrow_balance >= $3
       RETURNING remaining_amount, escrow_balance`;
