import { depotItemColumns } from "../../depot/sql/depotItemColumns";

/**
 * Locks the world-item roots standing on the given house tiles. Container
 * children live in 'container' locations and follow their locked root.
 */
export const houseEvictableRowsQuery = `
  SELECT ${depotItemColumns}
  FROM items
  WHERE location_type IN ('world', 'house')
    AND world_map_name = $1
    AND (world_x, world_y, world_z) IN (
      SELECT tile.x, tile.y, tile.z
      FROM unnest($2::int[], $3::int[], $4::int[]) AS tile(x, y, z)
    )
  ORDER BY id
  FOR UPDATE`;
