import { itemColumns } from "./itemColumns";

export const insertConjuredItem = `INSERT INTO items(
           id, item_type_id, count, attributes, version,
           location_type, container_id, slot_index
         )
         VALUES ($1, $2, $3, '{}'::jsonb, 1, 'container', $4, $5)
         RETURNING ${itemColumns}`;
