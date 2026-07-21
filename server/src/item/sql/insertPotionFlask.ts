import { itemColumns } from "./itemColumns";

export const insertPotionFlask = `INSERT INTO items(
         id, item_type_id, count, attributes, version,
         location_type, character_id, slot_index
       )
       VALUES ($1, $2, 1, '{}'::jsonb, 1, 'inventory', $3, $4)
       RETURNING ${itemColumns}`;
