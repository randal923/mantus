export const containerSlotIndexesQuery = `SELECT slot_index FROM items
       WHERE container_id = $1 AND location_type IN ('container', 'corpse')
       FOR UPDATE`;
