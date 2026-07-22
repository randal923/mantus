import type { ItemLocation } from "../item/ItemLocation";
import type { OwnedItemRow } from "./OwnedItemRow";

export function locationFromOwnedRow(row: OwnedItemRow): ItemLocation {
  if (
    row.location_type === "equipment" &&
    row.character_id &&
    row.equipment_slot
  ) {
    return {
      kind: "equipment",
      characterId: row.character_id,
      slot: row.equipment_slot,
    };
  }
  if (
    (row.location_type === "container" || row.location_type === "corpse") &&
    row.container_id &&
    row.slot_index !== null
  ) {
    return {
      kind: row.location_type,
      containerId: row.container_id,
      slot: row.slot_index,
    };
  }
  throw new Error(`item ${row.id} has an invalid economy location`);
}
