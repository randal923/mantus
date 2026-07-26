export const selectDeathsQuery = `SELECT level, cause,
              (extract(epoch from occurred_at) * 1000)::bigint AS occurred_at_ms
       FROM character_deaths
       WHERE character_id = $1
         AND occurred_at > now() - make_interval(days => $4)
       ORDER BY occurred_at DESC, id DESC
       LIMIT $2 OFFSET $3`;
