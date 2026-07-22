export const stagingSlotIndexesQuery = `SELECT slot_index FROM items
       WHERE character_id = $1 AND location_type = 'internal-staging'
       ORDER BY slot_index FOR UPDATE`;
