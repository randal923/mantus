import type { Item } from "../item/Item";
import type { DepotItemRow } from "./DepotItemRow";
import { isAttributes } from "./isAttributes";
import { locationFromRow } from "./locationFromRow";

export function itemFromRow(row: DepotItemRow): Item {
  if (!isAttributes(row.attributes)) {
    throw new Error(`item ${row.id} has invalid attributes`);
  }
  return {
    id: row.id,
    typeId: row.item_type_id,
    count: row.count,
    attributes: row.attributes,
    version: row.version,
    location: locationFromRow(row),
    ...(row.seed_key ? { seedKey: row.seed_key } : {}),
  };
}
