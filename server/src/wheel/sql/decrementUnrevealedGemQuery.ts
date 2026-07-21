export const decrementUnrevealedGemQuery = `UPDATE character_gem_resources SET
         lesser_gems = lesser_gems - CASE WHEN $2 = 0 THEN 1 ELSE 0 END,
         regular_gems = regular_gems - CASE WHEN $2 = 1 THEN 1 ELSE 0 END,
         greater_gems = greater_gems - CASE WHEN $2 = 2 THEN 1 ELSE 0 END,
         updated_at = now()
       WHERE character_id = $1
         AND (CASE WHEN $2 = 0 THEN lesser_gems
                   WHEN $2 = 1 THEN regular_gems
                   ELSE greater_gems END) >= 1`;
