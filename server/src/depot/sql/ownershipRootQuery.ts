import { depotItemColumns } from "./depotItemColumns";

export const ownershipRootQuery = `WITH RECURSIVE ancestry AS (
         SELECT item.*, 0 AS depth FROM items item WHERE item.id = $1
         UNION ALL
         SELECT parent.*, ancestry.depth + 1
         FROM items parent
         JOIN ancestry ON parent.id = ancestry.container_id
         WHERE ancestry.depth < 8
       )
       SELECT ${depotItemColumns}
       FROM ancestry
       WHERE character_id IS NOT NULL
       ORDER BY depth DESC
       LIMIT 1`;
