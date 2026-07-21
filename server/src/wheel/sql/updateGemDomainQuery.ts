export const updateGemDomainQuery = `UPDATE character_gems SET domain = $3
       WHERE id = $2 AND character_id = $1 AND NOT locked AND NOT equipped`;
