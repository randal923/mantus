export const inventorySlotIndexesQuery = `SELECT slot_index FROM items
       WHERE character_id = $1 AND location_type = 'inventory'
       FOR UPDATE`;
