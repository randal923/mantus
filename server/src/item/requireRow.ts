import type { ItemRow } from "./ItemRow";

export function requireRow(row: ItemRow | undefined): ItemRow {
  if (!row) throw new Error("item operation returned no row");
  return row;
}
