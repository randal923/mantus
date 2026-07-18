export const rewardItemInsert = `INSERT INTO items (
           id, item_type_id, count, attributes, location_type,
           character_id, slot_index
         ) VALUES ($1, $2, $3, $4::jsonb, 'inbox', $5, $6)`;
