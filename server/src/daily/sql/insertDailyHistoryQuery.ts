export const insertDailyHistoryQuery = `INSERT INTO character_daily_reward_history
         (character_id, reward_day, kind, allowance, items, claimed_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, to_timestamp($6::bigint / 1000.0))`;
