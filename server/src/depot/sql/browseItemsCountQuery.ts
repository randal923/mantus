import { browseItemsLocatedCte } from "./browseItemsLocatedCte";
import { browseItemsSearchPredicate } from "./browseItemsSearchPredicate";

export function browseItemsCountQuery(
  location: "depot" | "inbox",
  matchingItemTypeIds: ReadonlyArray<number> | null,
): string {
  const common = browseItemsLocatedCte(location);
  const searchPredicate = browseItemsSearchPredicate(matchingItemTypeIds);
  return `${common}
       SELECT count(*)::text AS count FROM located WHERE ${searchPredicate}`;
}
