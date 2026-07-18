import type { ItemCatalog } from "./ItemCatalog";
import type { ItemRow } from "./ItemRow";

export function canMergeRows(
  catalog: ItemCatalog,
  source: ItemRow,
  target: ItemRow | undefined,
  count: number,
): target is ItemRow {
  if (!target || target.id === source.id || target.seed_key) return false;
  const type = catalog.require(source.item_type_id);
  return (
    type.stackable &&
    target.item_type_id === source.item_type_id &&
    JSON.stringify(target.attributes) === JSON.stringify(source.attributes) &&
    target.count + count <= type.maxCount
  );
}
