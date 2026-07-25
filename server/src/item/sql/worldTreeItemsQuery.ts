import { itemColumns } from "./itemColumns";

/**
 * Every world-located item on the map plus the container subtrees inside
 * them, parents first — the boot snapshot for the memory-resident world
 * item cache. `age_ms` is how long each row has been unchanged, measured
 * entirely on the database clock so app/DB skew cannot shift a resumed decay
 * deadline.
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
  SELECT ${itemColumns},
    GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (now() - updated_at)) * 1000)
    )::bigint AS age_ms
  FROM world_roots ORDER BY item_depth, id`;
