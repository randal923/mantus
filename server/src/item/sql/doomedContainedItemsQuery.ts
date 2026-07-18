export const doomedContainedItemsQuery = `WITH RECURSIVE doomed AS (
         SELECT id, item_type_id, count, 1 AS depth
         FROM items
         WHERE location_type IN ('container', 'corpse')
           AND container_id = $1 AND slot_index >= $2
         UNION ALL
         SELECT child.id, child.item_type_id, child.count, doomed.depth + 1
         FROM items child
         JOIN doomed ON child.container_id = doomed.id
         WHERE child.location_type IN ('container', 'corpse')
           AND doomed.depth < 8
       )
       SELECT id, item_type_id, count FROM doomed`;
