import { itemColumns } from "../../item/sql/itemColumns";

/** A character's trade-reservation roots plus their nested contents. */
export const tradeReservationsQuery = `
  WITH RECURSIVE reserved AS (
    SELECT i.*, 1 AS item_depth
    FROM items i
    WHERE i.character_id = $1
      AND i.location_type = 'trade-reservation'
    UNION ALL
    SELECT child.*, reserved.item_depth + 1
    FROM items child
    JOIN reserved ON child.container_id = reserved.id
    WHERE child.location_type IN ('container', 'corpse')
      AND reserved.item_depth < 8
  )
  SELECT ${itemColumns}
  FROM reserved
  ORDER BY item_depth
  LIMIT 501`;
