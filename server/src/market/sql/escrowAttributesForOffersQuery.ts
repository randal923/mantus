/**
 * Attribute bags of escrowed items for a set of sell offers, one row per
 * attributed escrow item. Unique rarity listings escrow exactly one row, so
 * an offer id appearing once identifies the item the buyer would receive.
 */
export const escrowAttributesForOffersQuery = `SELECT e.offer_id, i.attributes
       FROM market_escrow_items e
       JOIN items i ON i.id = e.item_id
       WHERE e.offer_id = ANY($1::uuid[]) AND i.attributes <> '{}'::jsonb`;
