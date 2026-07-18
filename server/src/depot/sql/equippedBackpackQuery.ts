export const equippedBackpackQuery = `SELECT id, item_type_id FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = 'backpack'
       FOR UPDATE`;
