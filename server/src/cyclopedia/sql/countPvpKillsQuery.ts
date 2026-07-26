export const countPvpKillsQuery = `SELECT count(*)::int AS total
       FROM character_kills
       WHERE killer_character_id = $1
         AND occurred_at > now() - make_interval(days => $2)`;
