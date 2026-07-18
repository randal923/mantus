import { depotItemColumns } from "./depotItemColumns";

export const withdrawMoveToDestinationUpdate = `UPDATE items
           SET count = $2, location_type = $3, character_id = $4,
               depot_id = null, slot_index = $6, container_id = $5,
               equipment_slot = null, world_map_name = null,
               world_x = null, world_y = null, world_z = null,
               world_stack_index = null, version = version + 1,
               updated_at = now()
           WHERE id = $1 AND version = $7
           RETURNING ${depotItemColumns}`;
