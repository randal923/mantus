import { browseStashPredicate } from "./browseStashPredicate";

export function browseStashPageQuery(
  matchingItemTypeIds: ReadonlyArray<number> | null,
): string {
  const predicate = browseStashPredicate(matchingItemTypeIds);
  return `SELECT item_type_id, count::text AS count
       FROM supply_stash
       WHERE ${predicate}
       ORDER BY item_type_id
       LIMIT $3 OFFSET $4`;
}
