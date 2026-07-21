export const insertGemResourcesRowQuery = `INSERT INTO character_gem_resources (character_id)
       VALUES ($1) ON CONFLICT (character_id) DO NOTHING`;
