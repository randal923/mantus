/** One round trip for everything the market-open projection needs. */
export const marketOpenDataQuery = `SELECT
         coalesce(
           (SELECT balance FROM bank_accounts WHERE character_id = $1), 0
         )::bigint AS balance,
         (SELECT count(*) FROM market_offers WHERE character_id = $1)::int
           AS active_count,
         ARRAY(
           SELECT DISTINCT item_type_id FROM market_offers
           WHERE expires_at > now()
           ORDER BY item_type_id
           LIMIT $2
         )::int[] AS offer_type_ids`;
