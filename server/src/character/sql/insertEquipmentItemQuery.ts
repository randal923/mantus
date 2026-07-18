export const insertEquipmentItemQuery = `INSERT INTO items (
           id, item_type_id, count, location_type, character_id, equipment_slot
         ) VALUES ($1, $2, $3, 'equipment', $4, $5)`;
