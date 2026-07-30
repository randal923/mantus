/** Newest first, capped by $2 — one character's own claims only. */
export const readDailyHistoryQuery = `SELECT
         reward_day, kind, allowance, items,
         (extract(epoch from claimed_at) * 1000)::bigint::text AS claimed_at_ms
       FROM character_daily_reward_history
       WHERE character_id = $1
       ORDER BY claimed_at DESC, id DESC
       LIMIT $2`;
