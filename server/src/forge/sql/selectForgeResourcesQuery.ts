export const selectForgeResourcesQuery = `SELECT dusts, dust_level
       FROM character_forge_resources
       WHERE character_id = $1`;
