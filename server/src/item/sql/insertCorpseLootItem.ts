import { itemColumns } from "./itemColumns";

export const insertCorpseLootItem = `INSERT INTO items (
             id, item_type_id, count, attributes, location_type,
             container_id, slot_index
           ) VALUES ($1, $2, $3, '{}'::jsonb, 'corpse', $4, $5)
           RETURNING ${itemColumns}`;
