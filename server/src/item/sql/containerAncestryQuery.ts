export const containerAncestryQuery = `WITH RECURSIVE ancestry AS (
         SELECT id, container_id, 1 AS depth
         FROM items
         WHERE id = $1
         UNION ALL
         SELECT parent.id, parent.container_id, ancestry.depth + 1
         FROM items parent
         JOIN ancestry ON parent.id = ancestry.container_id
         WHERE ancestry.depth < 9
       )
       SELECT id, depth FROM ancestry`;
