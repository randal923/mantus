import { itemColumns } from "./itemColumns";

export const moveSwapDisplacedToContainerUpdate = `UPDATE items
                 SET location_type = 'container', character_id = null,
                     container_id = $2, slot_index = $3,
                     equipment_slot = null, updated_at = now()
                 WHERE id = $1
                 RETURNING ${itemColumns}`;
