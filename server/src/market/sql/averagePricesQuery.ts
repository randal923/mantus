export const averagePricesQuery = `SELECT item_type_id, floor(avg(unit_price))::bigint AS average_price
       FROM market_history
       WHERE state = 'accepted' AND role = 'creator'
         AND item_type_id = ANY($1::int[])
       GROUP BY item_type_id`;
