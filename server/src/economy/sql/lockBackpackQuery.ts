export const lockBackpackQuery = `
  WITH backpack AS MATERIALIZED (
    SELECT id, item_type_id
    FROM items
    WHERE character_id = $1
      AND location_type = 'equipment'
      AND equipment_slot = 'backpack'
    FOR UPDATE
  ),
  occupied AS MATERIALIZED (
    SELECT child.slot_index
    FROM items child
    JOIN backpack ON child.container_id = backpack.id
    WHERE child.location_type = 'container'
    ORDER BY child.slot_index
    FOR UPDATE OF child
  )
  SELECT backpack.id, backpack.item_type_id, occupied.slot_index
  FROM backpack
  LEFT JOIN occupied ON true
  ORDER BY occupied.slot_index`;
