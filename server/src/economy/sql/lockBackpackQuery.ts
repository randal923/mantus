/**
 * Locks the equipped backpack and everything nested inside it, so grants can
 * descend into carried bags instead of failing when the top level is full.
 * Rows are locked in id order (matching the depot's subtree lock) so two
 * transactions touching the same carried items cannot deadlock each other.
 */
export const lockBackpackQuery = `
  WITH RECURSIVE subtree AS (
    SELECT id, 0 AS depth
    FROM items
    WHERE character_id = $1
      AND location_type = 'equipment'
      AND equipment_slot = 'backpack'
    UNION ALL
    SELECT child.id, subtree.depth + 1
    FROM items child
    JOIN subtree ON child.container_id = subtree.id
    WHERE child.location_type = 'container'
      AND subtree.depth < 8
  )
  SELECT id, item_type_id, container_id, slot_index
  FROM items
  WHERE id IN (SELECT id FROM subtree)
  ORDER BY id
  FOR UPDATE`;
