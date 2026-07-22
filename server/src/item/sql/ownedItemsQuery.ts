import { itemColumns } from "./itemColumns";

export const ownedItemsQuery = `
  WITH RECURSIVE owned AS (
    SELECT i.*, 1 AS item_depth
    FROM items i
    WHERE i.character_id = $1
      AND i.location_type = 'equipment'
    UNION ALL
    SELECT child.*, owned.item_depth + 1
    FROM items child
    JOIN owned ON child.container_id = owned.id
    WHERE child.location_type IN ('container', 'corpse')
      AND owned.item_depth < 8
  )
  SELECT ${itemColumns}
  FROM owned
  ORDER BY item_depth, location_type, equipment_slot, slot_index
  LIMIT 501`;
