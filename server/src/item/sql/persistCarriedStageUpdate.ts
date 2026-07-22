export const persistCarriedStageUpdate = `UPDATE items
       SET location_type = 'internal-staging', character_id = $4,
           container_id = NULL, slot_index = $5, equipment_slot = NULL,
           depot_id = NULL, world_map_name = NULL, world_x = NULL,
           world_y = NULL, world_z = NULL, world_stack_index = NULL,
           version = $3, updated_at = now()
       WHERE id = $1 AND version = $2`;
