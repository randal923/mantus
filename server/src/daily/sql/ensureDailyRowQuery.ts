export const ensureDailyRowQuery = `INSERT INTO character_daily_rewards (character_id)
       VALUES ($1)
       ON CONFLICT (character_id) DO NOTHING`;
