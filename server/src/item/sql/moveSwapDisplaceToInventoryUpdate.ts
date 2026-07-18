export const moveSwapDisplaceToInventoryUpdate = `UPDATE items
           SET location_type = 'inventory', character_id = $2,
               container_id = null, slot_index = $3,
               equipment_slot = null, version = version + 1,
               updated_at = now()
           WHERE id = $1`;
