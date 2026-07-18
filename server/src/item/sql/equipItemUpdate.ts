import { itemColumns } from "./itemColumns";

export const equipItemUpdate = `UPDATE items
         SET item_type_id = $3, location_type = 'equipment',
             character_id = $1, equipment_slot = $4,
             container_id = null, slot_index = null,
             world_map_name = null, world_x = null, world_y = null,
             world_z = null, world_stack_index = null,
             version = version + 1, updated_at = now()
         WHERE id = $2
         RETURNING ${itemColumns}`;
