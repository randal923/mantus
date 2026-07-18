export const insertContainerItemQuery = `INSERT INTO items (
           id, item_type_id, count, location_type, container_id, slot_index
         ) VALUES ($1, $2, $3, 'container', $4, $5)`;
