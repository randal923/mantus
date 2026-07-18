export const lockBackpackSlotIndexesQuery = `SELECT slot_index FROM items
       WHERE container_id = $1 AND location_type = 'container'
       ORDER BY slot_index
       FOR UPDATE`;
