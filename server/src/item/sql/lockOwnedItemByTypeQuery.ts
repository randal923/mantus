import { itemColumns } from "./itemColumns";

export const lockOwnedItemByTypeQuery = `WITH RECURSIVE owned AS (
         SELECT id, container_id, character_id, location_type, 1 AS depth
         FROM items
         WHERE character_id = $1
           AND location_type IN ('equipment', 'inventory')
         UNION ALL
         SELECT child.id, child.container_id, child.character_id,
           child.location_type, owned.depth + 1
         FROM items child
         JOIN owned ON child.container_id = owned.id
         WHERE child.location_type IN ('container', 'corpse')
           AND owned.depth < 8
       )
       SELECT ${itemColumns}
       FROM items
       WHERE id IN (SELECT id FROM owned)
         AND item_type_id = $2
       ORDER BY id
       LIMIT 1
       FOR UPDATE`;
