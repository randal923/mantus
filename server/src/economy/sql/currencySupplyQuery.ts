/**
 * The whole money supply at this instant: every coin item row wherever it
 * lives (carried, depot, inbox, world, corpses, market escrow), every bank
 * balance, and the money escrowed behind open buy offers. Sell offers escrow
 * items, not money, so they are already counted by the coin sum — nothing is
 * double counted.
 */
export const currencySupplyQuery = `
  SELECT
    coalesce((
      SELECT sum(
        count::bigint * CASE item_type_id
          WHEN $1 THEN 1 WHEN $2 THEN $4::bigint WHEN $3 THEN $5::bigint
        END
      )
      FROM items
      WHERE item_type_id IN ($1, $2, $3)
    ), 0) AS coins,
    coalesce((SELECT sum(balance) FROM bank_accounts), 0) AS bank,
    coalesce((SELECT sum(escrow_balance) FROM market_offers), 0) AS escrow`;
