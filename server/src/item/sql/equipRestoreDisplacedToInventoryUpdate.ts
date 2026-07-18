import { itemColumns } from "./itemColumns";

export const equipRestoreDisplacedToInventoryUpdate = `UPDATE items
                 SET location_type = 'inventory', character_id = $2,
                     equipment_slot = null, container_id = null,
                     slot_index = $3, updated_at = now()
                 WHERE id = $1
                 RETURNING ${itemColumns}`;
