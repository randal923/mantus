export const ownedItemCountQuery = `WITH RECURSIVE owned AS (
         SELECT id
         FROM items
         WHERE character_id = $1
           AND location_type IN ('equipment', 'inventory')
         UNION ALL
         SELECT child.id
         FROM items child
         JOIN owned parent ON child.container_id = parent.id
         WHERE child.location_type IN ('container', 'corpse')
       )
       SELECT count(*)::text AS count FROM owned`;
