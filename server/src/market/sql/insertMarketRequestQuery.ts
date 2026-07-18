export const insertMarketRequestQuery = `INSERT INTO market_requests (request_id, character_id, kind)
       VALUES ($1, $2, $3)
       ON CONFLICT (request_id) DO NOTHING
       RETURNING request_id`;
