import { itemColumns } from "./itemColumns";

export const pickupToInventoryUpdate = `UPDATE items
         SET location_type = 'inventory', character_id = $2, slot_index = $3,
             container_id = null, equipment_slot = null,
             world_map_name = null, world_x = null, world_y = null,
             world_z = null, world_stack_index = null,
             version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${itemColumns}`;
