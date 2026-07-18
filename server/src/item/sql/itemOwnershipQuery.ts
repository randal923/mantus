export const itemOwnershipQuery = `WITH RECURSIVE ancestry AS (
         SELECT id, container_id, character_id, location_type, 1 AS depth
         FROM items WHERE id = $1
         UNION ALL
         SELECT parent.id, parent.container_id, parent.character_id,
           parent.location_type, ancestry.depth + 1
         FROM items parent
         JOIN ancestry ON parent.id = ancestry.container_id
         WHERE ancestry.depth < 8
       )
       SELECT character_id, location_type
       FROM ancestry
       WHERE character_id IS NOT NULL
       ORDER BY depth DESC
       LIMIT 1`;
