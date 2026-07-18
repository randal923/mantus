export const childExistsQuery = `SELECT 1 FROM items WHERE container_id = $1 LIMIT 1`;
