import type { OwnedItemRow } from "./OwnedItemRow";

export function countOwnedRows(rows: ReadonlyArray<OwnedItemRow>): number {
  return rows.reduce((total, row) => total + row.count, 0);
}
