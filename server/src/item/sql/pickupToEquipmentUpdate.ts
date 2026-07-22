import { itemColumns } from "./itemColumns";

export const pickupToEquipmentUpdate = `UPDATE items
         SET item_type_id = $2, location_type = 'equipment',
             character_id = $3, equipment_slot = $4,
             container_id = NULL, slot_index = NULL, depot_id = NULL,
             world_map_name = NULL, world_x = NULL, world_y = NULL,
             world_z = NULL, world_stack_index = NULL,
             version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${itemColumns}`;
