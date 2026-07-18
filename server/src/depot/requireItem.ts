import type { Item } from "../item/Item";
import type { DepotItemRow } from "./DepotItemRow";
import { itemFromRow } from "./itemFromRow";

export function requireItem(row: DepotItemRow | undefined): Item {
  if (!row) throw new Error("item operation returned no row");
  return itemFromRow(row);
}
