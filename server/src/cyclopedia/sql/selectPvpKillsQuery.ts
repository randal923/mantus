export const selectPvpKillsQuery = `SELECT c.name AS victim_name, k.unjustified,
              (extract(epoch from k.occurred_at) * 1000)::bigint AS occurred_at_ms
       FROM character_kills k
       JOIN characters c ON c.id = k.victim_character_id
       WHERE k.killer_character_id = $1
         AND k.occurred_at > now() - make_interval(days => $4)
       ORDER BY k.occurred_at DESC, k.id DESC
       LIMIT $2 OFFSET $3`;
