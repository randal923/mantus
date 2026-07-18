import type { Item } from "./Item";
import type { ItemRow } from "./ItemRow";
import { itemFromRow } from "./itemFromRow";
import { requireRow } from "./requireRow";

export function requireReturnedItem(row: ItemRow | undefined): Item {
  return itemFromRow(requireRow(row));
}
