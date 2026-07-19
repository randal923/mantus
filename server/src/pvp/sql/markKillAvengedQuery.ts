export const markKillAvengedQuery = `UPDATE character_kills
         SET avenged = true
         WHERE id = (
           SELECT id FROM character_kills
           WHERE killer_character_id = $1
             AND victim_character_id = $2
             AND unjustified
             AND NOT avenged
             AND occurred_at >= $3
           ORDER BY occurred_at ASC
           LIMIT 1
         )`;
