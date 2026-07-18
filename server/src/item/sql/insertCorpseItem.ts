import { itemColumns } from "./itemColumns";

export const insertCorpseItem = `INSERT INTO items (
           id, item_type_id, count, attributes, location_type,
           world_map_name, world_x, world_y, world_z, world_stack_index
         ) VALUES ($1, $2, 1, $8::jsonb, 'world', $3, $4, $5, $6, $7)
         RETURNING ${itemColumns}`;
