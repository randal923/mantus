export const persistSeededInsert = `INSERT INTO items (
         id, item_type_id, count, attributes, version, location_type,
         character_id, container_id, slot_index, equipment_slot,
         world_map_name, world_x, world_y, world_z, world_stack_index,
         seed_key, seed_map_name, seed_map_version,
         seed_x, seed_y, seed_z, seed_stack_index
       ) VALUES (
         $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, $21, $22
       )`;
