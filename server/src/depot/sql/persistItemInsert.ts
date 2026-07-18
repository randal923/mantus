export const persistItemInsert = `INSERT INTO items (
         id, item_type_id, count, attributes, version, location_type,
         character_id, container_id, slot_index, equipment_slot, depot_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;
