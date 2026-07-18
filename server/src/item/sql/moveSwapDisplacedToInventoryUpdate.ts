import { itemColumns } from "./itemColumns";

export const moveSwapDisplacedToInventoryUpdate = `UPDATE items
                 SET location_type = 'inventory', character_id = $2,
                     container_id = null, slot_index = $3,
                     equipment_slot = null, updated_at = now()
                 WHERE id = $1
                 RETURNING ${itemColumns}`;
