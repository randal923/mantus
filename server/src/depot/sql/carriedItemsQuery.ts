import { depotItemColumns } from "./depotItemColumns";

export const carriedItemsQuery = `WITH RECURSIVE carried AS (
         SELECT root.*, 1 AS depth
         FROM items root
         WHERE root.character_id = $1
           AND root.location_type IN ('equipment', 'inventory')
         UNION ALL
         SELECT child.*, carried.depth + 1
         FROM items child
         JOIN carried ON child.container_id = carried.id
         WHERE child.location_type IN ('container', 'corpse')
           AND carried.depth < 8
       )
       SELECT ${depotItemColumns} FROM carried LIMIT 501`;
