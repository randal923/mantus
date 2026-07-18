import { depotItemColumns } from "./depotItemColumns";

export const withdrawMoveIntoTargetUpdate = `UPDATE items
             SET count = $2, location_type = $3, character_id = $4,
                 container_id = $5, slot_index = $6, equipment_slot = $7,
                 depot_id = null, world_map_name = null, world_x = null,
                 world_y = null, world_z = null, world_stack_index = null,
                 version = version + 1, updated_at = now()
             WHERE id = $1 AND version = $8
             RETURNING ${depotItemColumns}`;
