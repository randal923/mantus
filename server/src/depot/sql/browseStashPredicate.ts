export function browseStashPredicate(
  matchingItemTypeIds: ReadonlyArray<number> | null,
): string {
  return matchingItemTypeIds === null
    ? "character_id = $1 AND cardinality($2::integer[]) >= 0"
    : "character_id = $1 AND item_type_id = ANY($2::integer[])";
}
