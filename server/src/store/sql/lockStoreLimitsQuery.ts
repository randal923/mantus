/** The per-character purchase counters, created on first use and locked. */
export const lockStoreLimitsQuery = `SELECT
         to_char(exp_boost_day, 'YYYY-MM-DD') AS exp_boost_day,
         exp_boost_count
       FROM character_store_limits
       WHERE character_id = $1
       FOR UPDATE`;
