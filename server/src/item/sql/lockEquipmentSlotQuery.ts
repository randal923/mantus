import { itemColumns } from "./itemColumns";

export const lockEquipmentSlotQuery = `SELECT ${itemColumns}
       FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = $2 AND id <> $3
       FOR UPDATE`;
