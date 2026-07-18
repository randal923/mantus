import type { OwnedItemRow } from "./OwnedItemRow";
import { ownedRowHasSubtype } from "./ownedRowHasSubtype";
import type { ShopItemSubtype } from "./ShopStore";

/**
 * Rows the player may sell: not equipped, and not a container that still
 * holds other items (deleting those would orphan the contents).
 */
export function sellableShopRows(
  owned: ReadonlyArray<OwnedItemRow>,
  itemTypeId: number,
  subtype?: ShopItemSubtype,
): OwnedItemRow[] {
  const parents = new Set(
    owned.flatMap((row) => (row.container_id ? [row.container_id] : [])),
  );
  return owned
    .filter(
      (row) =>
        row.item_type_id === itemTypeId &&
        row.location_type !== "equipment" &&
        !parents.has(row.id) &&
        ownedRowHasSubtype(row, subtype),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}
