import { itemColumns } from "./itemColumns";

export const lockBackpackQuery = `SELECT ${itemColumns}
       FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = 'backpack'
       FOR UPDATE`;
