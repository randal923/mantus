export const countDeathsQuery = `SELECT count(*)::int AS total
       FROM character_deaths
       WHERE character_id = $1
         AND occurred_at > now() - make_interval(days => $2)`;
