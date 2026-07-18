import { browseStashPredicate } from "./browseStashPredicate";

export function browseStashCountQuery(
  matchingItemTypeIds: ReadonlyArray<number> | null,
): string {
  const predicate = browseStashPredicate(matchingItemTypeIds);
  return `SELECT count(*)::text AS count FROM supply_stash WHERE ${predicate}`;
}
