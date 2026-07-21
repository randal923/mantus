export const upsertGemDropsQuery = `INSERT INTO character_gem_resources (
         character_id, lesser_gems, regular_gems, greater_gems
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (character_id) DO UPDATE SET
         lesser_gems = character_gem_resources.lesser_gems + excluded.lesser_gems,
         regular_gems = character_gem_resources.regular_gems + excluded.regular_gems,
         greater_gems = character_gem_resources.greater_gems + excluded.greater_gems,
         updated_at = now()`;
