import type { OwnedItemRow } from "./OwnedItemRow";

export function rowsOfItemType(
  rows: ReadonlyArray<OwnedItemRow>,
  itemTypeId: number,
): OwnedItemRow[] {
  return rows
    .filter((row) => row.item_type_id === itemTypeId)
    .sort((left, right) => left.id.localeCompare(right.id));
}
