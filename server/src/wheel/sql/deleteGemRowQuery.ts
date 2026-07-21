export const deleteGemRowQuery = `DELETE FROM character_gems
       WHERE id = $2 AND character_id = $1 AND NOT locked AND NOT equipped`;
