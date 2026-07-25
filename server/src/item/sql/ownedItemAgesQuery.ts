/**
 * How long each of a character's item rows has been unchanged, measured
 * entirely on the database clock so app/DB skew cannot shift a resumed carried
 * decay deadline. Mirrors `worldTreeItemsQuery`'s `age_ms` for the carried
 * side.
 */
export const ownedItemAgesQuery = `
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
  SELECT id,
    GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (now() - updated_at)) * 1000)
    )::bigint AS age_ms
  FROM owned
  LIMIT 501`;
