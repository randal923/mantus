export const characterByNormalizedNameQuery = `SELECT id, display_name
         FROM characters
         WHERE normalized_name = $1`;
