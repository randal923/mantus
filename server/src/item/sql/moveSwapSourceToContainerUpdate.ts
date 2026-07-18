import { itemColumns } from "./itemColumns";

export const moveSwapSourceToContainerUpdate = `UPDATE items
           SET location_type = 'container', character_id = null,
               equipment_slot = null, container_id = $2, slot_index = $3,
               version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${itemColumns}`;
