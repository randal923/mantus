import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";

/** Memory mirror of the DB-side stack-merge eligibility check. */
export function canMergeItems(
  catalog: ItemCatalog,
  source: Item,
  target: Item | undefined,
  count: number,
): target is Item {
  if (!target || target.id === source.id || target.seedKey) return false;
  const type = catalog.require(source.typeId);
  return (
    type.stackable &&
    target.typeId === source.typeId &&
    JSON.stringify(target.attributes) === JSON.stringify(source.attributes) &&
    target.count + count <= type.maxCount
  );
}
