import { itemColumns } from "./itemColumns";

export const moveReadStateQuery = `WITH RECURSIVE locked_character AS MATERIALIZED (
         SELECT id FROM characters WHERE id = $1 FOR UPDATE
       ), locked_items AS MATERIALIZED (
         SELECT ${itemColumns}
         FROM items
         WHERE id = ANY($2::uuid[])
           AND EXISTS (SELECT 1 FROM locked_character)
         ORDER BY id
         FOR UPDATE
       ), slot_target AS MATERIALIZED (
         SELECT ${itemColumns}
         FROM items
         WHERE container_id = $3
           AND location_type IN ('container', 'corpse')
           AND slot_index = $4
           AND EXISTS (SELECT 1 FROM locked_items)
         FOR UPDATE
       ), ancestry AS (
         SELECT li.id AS origin_id, li.id, li.container_id, li.character_id,
           li.location_type, 1 AS depth
         FROM locked_items li
         UNION ALL
         SELECT ancestry.origin_id, parent.id, parent.container_id,
           parent.character_id, parent.location_type, ancestry.depth + 1
         FROM items parent
         JOIN ancestry ON parent.id = ancestry.container_id
         WHERE ancestry.depth < 9
       ), item_contents AS (
         SELECT $5::uuid AS id, 1 AS depth
         UNION ALL
         SELECT child.id, item_contents.depth + 1
         FROM items child
         JOIN item_contents ON child.container_id = item_contents.id
         WHERE child.location_type IN ('container', 'corpse')
           AND item_contents.depth < 9
       ), owned AS (
         SELECT id FROM items
         WHERE character_id = $1
           AND location_type IN ('equipment', 'inventory')
         UNION ALL
         SELECT child.id FROM items child
         JOIN owned ON child.container_id = owned.id
         WHERE child.location_type IN ('container', 'corpse')
       )
       SELECT
         (SELECT count(*)::integer FROM locked_character) AS character_count,
         (SELECT coalesce(json_agg(row_to_json(locked_items)), '[]'::json)
          FROM locked_items) AS items,
         (SELECT row_to_json(slot_target) FROM slot_target LIMIT 1)
           AS slot_target,
         (SELECT coalesce(json_agg(json_build_object(
            'originId', origin_id, 'id', id, 'characterId', character_id,
            'locationType', location_type, 'depth', depth)), '[]'::json)
          FROM ancestry) AS ancestry,
         (SELECT max(depth)::integer FROM item_contents) AS item_depth,
         (SELECT CASE WHEN $6::boolean
            THEN (SELECT count(*)::integer FROM owned) END) AS owned_count`;
