export const lockRootInventoryItemsQuery = `SELECT id, item_type_id, count, attributes, version, location_type,
              character_id, container_id, slot_index, equipment_slot, seed_key
       FROM items
       WHERE character_id = $1 AND location_type = 'inventory'
       ORDER BY slot_index, id
       FOR UPDATE`;
