export const inventorySlotsForUpdateQuery = `SELECT slot_index FROM items
       WHERE character_id = $1 AND location_type = 'inventory'
       ORDER BY slot_index FOR UPDATE`;
