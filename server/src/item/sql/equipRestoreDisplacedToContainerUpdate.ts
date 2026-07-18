import { itemColumns } from "./itemColumns";

export const equipRestoreDisplacedToContainerUpdate = `UPDATE items
                 SET location_type = 'container', character_id = null,
                     equipment_slot = null, container_id = $2,
                     slot_index = $3, updated_at = now()
                 WHERE id = $1
                 RETURNING ${itemColumns}`;
