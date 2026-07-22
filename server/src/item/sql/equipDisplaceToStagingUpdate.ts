export const equipDisplaceToStagingUpdate = `UPDATE items
           SET item_type_id = $2, location_type = 'internal-staging',
               character_id = $3, equipment_slot = null,
               container_id = null, slot_index = $4, depot_id = null,
               world_map_name = null, world_x = null, world_y = null,
               world_z = null, world_stack_index = null,
               version = version + 1, updated_at = now()
           WHERE id = $1`;
