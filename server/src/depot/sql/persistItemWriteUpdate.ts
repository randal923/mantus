export const persistItemWriteUpdate = `UPDATE items
       SET count = $2, version = $3, location_type = $4, character_id = $5,
           container_id = $6, slot_index = $7, equipment_slot = $8,
           depot_id = $9, world_map_name = null, world_x = null,
           world_y = null, world_z = null, world_stack_index = null,
           updated_at = now()
       WHERE id = $1 AND version = $10`;
