import { itemColumns } from "./itemColumns";

export const pickupMergeIntoContainerUpdate = `UPDATE items
           SET count = count + $2, location_type = 'container',
               container_id = $3, slot_index = $4,
               character_id = null, equipment_slot = null,
               world_map_name = null, world_x = null, world_y = null,
               world_z = null, world_stack_index = null,
               version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${itemColumns}`;
