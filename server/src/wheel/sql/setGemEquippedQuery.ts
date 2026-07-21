export const setGemEquippedQuery = `UPDATE character_gems SET equipped = true
       WHERE id = $3 AND character_id = $1 AND domain = $2`;
