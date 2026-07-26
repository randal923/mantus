export const selectAnimusQuery = `SELECT race_id
       FROM character_animus_masteries
       WHERE character_id = $1`;
