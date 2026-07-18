import { itemColumns } from "./itemColumns";

export const insertSplitItem = `INSERT INTO items (
           id, item_type_id, count, attributes, location_type,
           character_id, container_id, slot_index
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
         RETURNING ${itemColumns}`;
