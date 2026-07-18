export const containerDescendantDepthQuery = `WITH RECURSIVE descendants AS (
         SELECT id, 1 AS depth
         FROM items
         WHERE id = $1
         UNION ALL
         SELECT child.id, descendants.depth + 1
         FROM items child
         JOIN descendants ON child.container_id = descendants.id
         WHERE child.location_type IN ('container', 'corpse')
           AND descendants.depth < 9
       )
       SELECT max(depth)::integer AS depth FROM descendants`;
