export const readDailyRowQuery = `SELECT
         streak_position, streak_level, joker_tokens,
         to_char(last_claim_day, 'YYYY-MM-DD') AS last_claim_day,
         last_joker_month, xp_boost_until_ms::text AS xp_boost_until_ms
       FROM character_daily_rewards
       WHERE character_id = $1`;
