export const persistCarriedWriteUpdate = `UPDATE items
       SET item_type_id = $2, count = $3, attributes = $4::jsonb,
           version = $5, location_type = $6, character_id = $7,
           container_id = $8, slot_index = $9, equipment_slot = $10,
           depot_id = null, world_map_name = null, world_x = null,
           world_y = null, world_z = null, world_stack_index = null,
           updated_at = now()
       WHERE id = $1 AND version = $11`;
