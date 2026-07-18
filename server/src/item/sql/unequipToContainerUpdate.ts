import { itemColumns } from "./itemColumns";

export const unequipToContainerUpdate = `UPDATE items
           SET item_type_id = $2, location_type = 'container',
               character_id = null, equipment_slot = null,
               container_id = $3, slot_index = $4,
               version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${itemColumns}`;
