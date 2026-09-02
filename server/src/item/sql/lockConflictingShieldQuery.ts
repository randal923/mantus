export const lockConflictingShieldQuery = `SELECT id, item_type_id FROM items
         WHERE character_id = $1 AND location_type = 'equipment'
           AND equipment_slot = 'shield' AND id <> $2
         FOR UPDATE`;
