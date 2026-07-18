export const worldStackIndexesQuery = `SELECT world_stack_index FROM items
       WHERE location_type IN ('world', 'house') AND world_map_name = $1
         AND world_x = $2 AND world_y = $3 AND world_z = $4
       FOR UPDATE`;
