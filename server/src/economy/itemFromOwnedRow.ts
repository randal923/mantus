import type { Item } from "../item/Item";
import { locationFromOwnedRow } from "./locationFromOwnedRow";
import type { OwnedItemRow } from "./OwnedItemRow";

export function itemFromOwnedRow(row: OwnedItemRow): Item {
  if (
    !row.attributes ||
    typeof row.attributes !== "object" ||
    Array.isArray(row.attributes)
  ) {
    throw new Error(`item ${row.id} has invalid attributes`);
  }
  return {
    id: row.id,
    typeId: row.item_type_id,
    count: row.count,
    attributes: row.attributes as Record<string, unknown>,
    version: row.version,
    location: locationFromOwnedRow(row),
    ...(row.seed_key ? { seedKey: row.seed_key } : {}),
  };
}
