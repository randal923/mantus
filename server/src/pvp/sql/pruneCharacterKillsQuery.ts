export const pruneCharacterKillsQuery = `DELETE FROM character_kills
         WHERE killer_character_id = $1 AND occurred_at < $2`;
