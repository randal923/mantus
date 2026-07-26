export const rewardSlotIndexesQuery = `SELECT slot_index
       FROM items
       WHERE character_id = $1 AND location_type = 'reward'
       FOR UPDATE`;
