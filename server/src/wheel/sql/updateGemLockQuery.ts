export const updateGemLockQuery = `UPDATE character_gems SET locked = $3
       WHERE id = $2 AND character_id = $1`;
