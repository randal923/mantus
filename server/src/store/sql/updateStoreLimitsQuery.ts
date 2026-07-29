/** Rolls the counter to today, or bumps it when it already is today. */
export const updateStoreLimitsQuery = `UPDATE character_store_limits
       SET exp_boost_day = $2::date,
           exp_boost_count = $3,
           updated_at = now()
       WHERE character_id = $1`;
