export const incompatibleSeedsQuery = `SELECT 1 FROM items
       WHERE seed_map_name = $1 AND seed_map_version <> $2
       LIMIT 1`;
