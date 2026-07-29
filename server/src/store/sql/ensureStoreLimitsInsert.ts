export const ensureStoreLimitsInsert = `INSERT INTO character_store_limits (character_id)
       VALUES ($1)
       ON CONFLICT (character_id) DO NOTHING`;
