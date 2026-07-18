import { itemColumns } from "./itemColumns";

export const itemContentsQuery = `WITH RECURSIVE contents AS (
         SELECT i.*, 1 AS item_depth
         FROM items i
         WHERE i.id = $1
         UNION ALL
         SELECT child.*, contents.item_depth + 1
         FROM items child
         JOIN contents ON child.container_id = contents.id
         WHERE child.location_type IN ('container', 'corpse')
           AND contents.item_depth < 8
       )
       SELECT ${itemColumns}
       FROM contents
       LIMIT 501`;
