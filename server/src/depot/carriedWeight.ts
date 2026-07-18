import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";

/** Total weight in hundredths of an ounce, matching the DB-side check. */
export function carriedWeight(
  catalog: ItemCatalog,
  items: ReadonlyArray<Item>,
): number {
  return items.reduce(
    (total, item) => total + catalog.require(item.typeId).weight * item.count,
    0,
  );
}
