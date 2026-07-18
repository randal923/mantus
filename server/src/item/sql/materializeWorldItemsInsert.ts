export const materializeWorldItemsInsert = `WITH source AS (
         SELECT * FROM jsonb_to_recordset($7::jsonb) AS seed(
           id uuid, "seedKey" text, "typeId" integer, count smallint,
           attributes jsonb, "locationType" text, "containerId" uuid,
           "slotIndex" smallint
         )
       ), inserted AS (
         INSERT INTO items (
           id, item_type_id, count, attributes, location_type,
           character_id, container_id, slot_index,
           world_map_name, world_x, world_y, world_z, world_stack_index,
           seed_key, seed_map_name, seed_map_version,
           seed_x, seed_y, seed_z, seed_stack_index
         )
         SELECT id, "typeId", count, attributes, "locationType",
           null, "containerId", "slotIndex",
           CASE WHEN "locationType" = 'world' THEN $1 ELSE null END,
           CASE WHEN "locationType" = 'world' THEN $3::integer ELSE null END,
           CASE WHEN "locationType" = 'world' THEN $4::integer ELSE null END,
           CASE WHEN "locationType" = 'world' THEN $5::smallint ELSE null END,
           CASE WHEN "locationType" = 'world' THEN $6::smallint ELSE null END,
           "seedKey", $1, $2, $3, $4, $5, $6
         FROM source
         ON CONFLICT (seed_key) DO NOTHING
         RETURNING id, item_type_id, count, seed_key
       ), audited AS (
         INSERT INTO audit_log(event_type, item_id, details)
         SELECT 'world-item-seeded', id,
           jsonb_build_object(
             'map', $1::text, 'mapVersion', $2::text,
             'seedKey', seed_key, 'itemTypeId', item_type_id, 'count', count,
             'reason', 'first-mutation'
           )
         FROM inserted
       )
       SELECT count(*) FROM inserted`;
