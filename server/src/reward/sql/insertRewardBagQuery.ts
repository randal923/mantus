export const insertRewardBagQuery = `INSERT INTO items (
         id, item_type_id, count, attributes, version,
         location_type, character_id, slot_index
       ) VALUES ($1, $2, 1, $3::jsonb, 1, 'reward', $4, $5)`;
