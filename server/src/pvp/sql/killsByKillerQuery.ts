export const killsByKillerQuery = `SELECT victim_character_id, occurred_at, unjustified, avenged
         FROM character_kills
         WHERE killer_character_id = $1
         ORDER BY occurred_at ASC`;
