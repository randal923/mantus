import { depotItemColumns } from "../../depot/sql/depotItemColumns";

export const moveItemToEscrowUpdate = `UPDATE items
         SET location_type = 'market-escrow', slot_index = $2,
             depot_id = null, container_id = null, equipment_slot = null,
             world_map_name = null, world_x = null, world_y = null,
             world_z = null, world_stack_index = null,
             version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${depotItemColumns}`;
