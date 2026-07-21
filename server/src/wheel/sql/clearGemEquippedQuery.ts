export const clearGemEquippedQuery = `UPDATE character_gems SET equipped = false
       WHERE character_id = $1 AND domain = $2 AND equipped`;
