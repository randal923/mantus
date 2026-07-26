// The claim write: streak advance plus the (possibly extended) XP boost
// deadline, guarded by the row lock the transaction already holds.
export const updateDailyClaimQuery = `UPDATE character_daily_rewards
       SET streak_position = $2,
           streak_level = $3,
           joker_tokens = $4,
           last_claim_day = $5::date,
           last_joker_month = $6,
           xp_boost_until_ms = GREATEST(xp_boost_until_ms, $7::bigint) + $8::bigint,
           updated_at = now()
       WHERE character_id = $1
       RETURNING xp_boost_until_ms::text AS xp_boost_until_ms`;
