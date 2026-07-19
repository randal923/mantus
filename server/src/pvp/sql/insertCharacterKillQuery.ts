export const insertCharacterKillQuery = `INSERT INTO character_kills (
           death_event_id, killer_character_id, victim_character_id,
           occurred_at, unjustified
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (death_event_id, killer_character_id) DO NOTHING
         RETURNING id`;
