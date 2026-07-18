export const equipDisplaceToInventoryUpdate = `UPDATE items
           SET item_type_id = $2, location_type = 'inventory',
               character_id = $3, equipment_slot = null,
               container_id = null, slot_index = $4,
               version = version + 1, updated_at = now()
           WHERE id = $1`;
