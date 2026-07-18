export function browseItemsSearchPredicate(
  matchingItemTypeIds: ReadonlyArray<number> | null,
): string {
  return matchingItemTypeIds === null
    ? "depth = 0 AND cardinality($3::integer[]) >= 0"
    : "item_type_id = ANY($3::integer[])";
}
