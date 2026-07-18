import { itemColumns } from "./itemColumns";

export const changedSeededItemsQuery = `SELECT ${itemColumns}
       FROM items
       WHERE seed_map_name = $1 AND seed_map_version = $2 AND version > 1`;
