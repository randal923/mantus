import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";

/**
 * The server's canonical container order: group by type family, then name,
 * bigger stacks first, item id as the stable final tiebreak so repeated
 * sorts are idempotent.
 */
export function compareContainerSortOrder(
  catalog: ItemCatalog,
  a: Item,
  b: Item,
): number {
  const typeA = catalog.require(a.typeId);
  const typeB = catalog.require(b.typeId);
  return (
    (typeA.primaryType ?? "").localeCompare(typeB.primaryType ?? "") ||
    typeA.name.localeCompare(typeB.name) ||
    b.count - a.count ||
    a.id.localeCompare(b.id)
  );
}
