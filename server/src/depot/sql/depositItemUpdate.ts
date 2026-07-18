import { depotItemColumns } from "./depotItemColumns";

export const depositItemUpdate = `UPDATE items
         SET location_type = 'depot', character_id = $2, depot_id = $3,
             slot_index = $4, container_id = null, equipment_slot = null,
             world_map_name = null, world_x = null, world_y = null,
             world_z = null, world_stack_index = null,
             version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${depotItemColumns}`;
