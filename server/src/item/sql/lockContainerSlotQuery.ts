import { itemColumns } from "./itemColumns";

export const lockContainerSlotQuery = `SELECT ${itemColumns}
       FROM items
       WHERE container_id = $1
         AND location_type IN ('container', 'corpse')
         AND slot_index = $2
       FOR UPDATE`;
