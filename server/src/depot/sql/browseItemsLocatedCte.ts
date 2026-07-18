import { browseItemsRootPredicate } from "./browseItemsRootPredicate";

export function browseItemsLocatedCte(location: "depot" | "inbox"): string {
  const rootPredicate = browseItemsRootPredicate(location);
  return `WITH RECURSIVE located AS (
      SELECT root.*, 0 AS depth
      FROM items root
      WHERE ${rootPredicate}
      UNION ALL
      SELECT child.*, located.depth + 1
      FROM items child
      JOIN located ON child.container_id = located.id
      WHERE child.location_type IN ('container', 'corpse')
        AND located.depth < 8
    )`;
}
