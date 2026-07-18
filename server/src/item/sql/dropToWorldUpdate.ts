import { itemColumns } from "./itemColumns";

export const dropToWorldUpdate = `UPDATE items
           SET location_type = 'world', world_map_name = $2,
               world_x = $3, world_y = $4, world_z = $5,
               world_stack_index = $6, character_id = null,
               container_id = null, slot_index = null, equipment_slot = null,
               version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${itemColumns}`;
