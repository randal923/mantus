export const ensureForgeResourcesQuery = `INSERT INTO character_forge_resources (character_id)
       VALUES ($1)
       ON CONFLICT (character_id) DO NOTHING`;
