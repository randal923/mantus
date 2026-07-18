export const insertCreatedItemQuery = `INSERT INTO items (
         id, item_type_id, count, attributes, location_type, container_id,
         slot_index
       ) VALUES ($1, $2, $3, $4::jsonb, 'container', $5, $6)`;
