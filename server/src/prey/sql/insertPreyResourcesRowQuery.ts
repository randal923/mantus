export const insertPreyResourcesRowQuery = `INSERT INTO character_prey_resources (character_id)
       VALUES ($1)
       ON CONFLICT (character_id) DO NOTHING`;
