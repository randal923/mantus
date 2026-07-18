export function browseItemsRootPredicate(location: "depot" | "inbox"): string {
  return location === "depot"
    ? "root.location_type = 'depot' AND root.character_id = $1 AND root.depot_id = $2"
    : "root.location_type = 'inbox' AND root.character_id = $1 AND $2::integer = $2::integer";
}
