export const selectGemRowsQuery = `SELECT id, domain, quality, basic_mod_1, basic_mod_2, supreme_mod,
              locked, equipped
       FROM character_gems WHERE character_id = $1
       ORDER BY created_at, id`;
