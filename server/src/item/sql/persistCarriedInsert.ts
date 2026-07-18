export const persistCarriedInsert = `INSERT INTO items (
         id, item_type_id, count, attributes, version, location_type,
         character_id, container_id, slot_index, equipment_slot,
         world_map_name, world_x, world_y, world_z, world_stack_index
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10,
                 $11, $12, $13, $14, $15)`;
