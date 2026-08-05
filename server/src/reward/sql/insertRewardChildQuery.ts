export const insertRewardChildQuery = `INSERT INTO items (
         id, item_type_id, count, attributes, version,
         location_type, container_id, slot_index
       ) VALUES ($1, $2, $3, $4::jsonb, 1, 'container', $5, $6)`;
