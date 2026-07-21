export const insertGemRowQuery = `INSERT INTO character_gems (
         id, character_id, domain, quality, basic_mod_1, basic_mod_2, supreme_mod
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
