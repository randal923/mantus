export const selectGemResourcesQuery = `SELECT lesser_gems, regular_gems, greater_gems,
              lesser_fragments, greater_fragments
       FROM character_gem_resources WHERE character_id = $1`;
