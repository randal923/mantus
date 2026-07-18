import { itemColumns } from "./itemColumns";

/**
 * Every world-located item on the map plus the container subtrees inside
 * them, parents first — the boot snapshot for the memory-resident world
 * item cache.
 */
export const worldTreeItemsQuery = `WITH RECURSIVE world_roots AS (
    SELECT i.*, 1 AS item_depth
    FROM items i
    WHERE i.location_type = 'world' AND i.world_map_name = $1
    UNION ALL
    SELECT child.*, world_roots.item_depth + 1
    FROM items child
    JOIN world_roots ON child.container_id = world_roots.id
    WHERE child.location_type IN ('container', 'corpse')
      AND world_roots.item_depth < 8
  )
  SELECT ${itemColumns} FROM world_roots ORDER BY item_depth, id`;
