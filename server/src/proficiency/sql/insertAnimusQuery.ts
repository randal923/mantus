export const insertAnimusQuery = `INSERT INTO character_animus_masteries (character_id, race_id)
       VALUES ($1, $2)
       ON CONFLICT (character_id, race_id) DO NOTHING`;
