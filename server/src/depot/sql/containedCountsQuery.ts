export const containedCountsQuery = `WITH RECURSIVE descendants AS (
         SELECT roots.id AS root_id, roots.id
         FROM items roots WHERE roots.id = ANY($1::uuid[])
         UNION ALL
         SELECT descendants.root_id, child.id
         FROM items child
         JOIN descendants ON child.container_id = descendants.id
         WHERE child.location_type IN ('container', 'corpse')
       )
       SELECT root_id, (count(*) - 1)::text AS count
       FROM descendants GROUP BY root_id`;
