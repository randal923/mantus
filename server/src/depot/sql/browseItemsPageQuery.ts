import { browseItemsLocatedCte } from "./browseItemsLocatedCte";
import { browseItemsSearchPredicate } from "./browseItemsSearchPredicate";
import { depotItemColumns } from "./depotItemColumns";

export function browseItemsPageQuery(
  location: "depot" | "inbox",
  matchingItemTypeIds: ReadonlyArray<number> | null,
): string {
  const common = browseItemsLocatedCte(location);
  const searchPredicate = browseItemsSearchPredicate(matchingItemTypeIds);
  return `${common}
       SELECT ${depotItemColumns}
       FROM located
       WHERE ${searchPredicate}
       ORDER BY item_type_id, slot_index, id
       LIMIT $4 OFFSET $5`;
}
