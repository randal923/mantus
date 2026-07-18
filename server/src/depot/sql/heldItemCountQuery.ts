export function heldItemCountQuery(location: "depot" | "inbox"): string {
  const rootPredicate =
    location === "depot"
      ? "root.location_type = 'depot' AND root.character_id = $1 AND root.depot_id = $2"
      : "root.location_type = 'inbox' AND root.character_id = $1 AND $2::integer IS NULL";
  return `WITH RECURSIVE held AS (
         SELECT root.id, 1 AS depth
         FROM items root WHERE ${rootPredicate}
         UNION ALL
         SELECT child.id, held.depth + 1
         FROM items child JOIN held ON child.container_id = held.id
         WHERE child.location_type IN ('container', 'corpse')
           AND held.depth < 8
       )
       SELECT count(*)::text AS count FROM held`;
}
