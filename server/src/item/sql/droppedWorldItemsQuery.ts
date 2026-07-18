import { itemColumns } from "./itemColumns";

export const droppedWorldItemsQuery = `SELECT ${itemColumns}
       FROM items
       WHERE seed_key IS NULL AND location_type = 'world'
         AND world_map_name = $1`;
