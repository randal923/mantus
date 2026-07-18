import { depotItemColumns } from "./depotItemColumns";

export const lockSubtreeQuery = `WITH RECURSIVE descendants AS (
         SELECT id, 0 AS depth FROM items WHERE id = $1
         UNION ALL
         SELECT child.id, descendants.depth + 1
         FROM items child
         JOIN descendants ON child.container_id = descendants.id
         WHERE child.location_type IN ('container', 'corpse')
           AND descendants.depth < 8
       )
       SELECT ${depotItemColumns}
       FROM items
       WHERE id IN (SELECT id FROM descendants)
       ORDER BY id
       FOR UPDATE`;
