import type { ItemLocation } from "../item/ItemLocation";
import type { DepotItemRow } from "./DepotItemRow";

export function locationFromRow(row: DepotItemRow): ItemLocation {
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
    row.location_type === "depot" &&
    row.character_id &&
    row.depot_id !== null &&
    row.slot_index !== null
  ) {
    return {
      kind: "depot",
      characterId: row.character_id,
      depotId: row.depot_id,
      slot: row.slot_index,
    };
  }
  if (
    ["inventory", "inbox", "trade-reservation", "market-escrow"].includes(
      row.location_type,
    ) &&
    row.character_id &&
    row.slot_index !== null
  ) {
    return {
      kind: row.location_type as
        | "inventory"
        | "inbox"
        | "trade-reservation"
        | "market-escrow",
      characterId: row.character_id,
      slot: row.slot_index,
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
  if (
    (row.location_type === "world" || row.location_type === "house") &&
    row.world_x !== null &&
    row.world_y !== null &&
    row.world_z !== null &&
    row.world_stack_index !== null
  ) {
    return {
      kind: row.location_type,
      position: { x: row.world_x, y: row.world_y, z: row.world_z },
      stackIndex: row.world_stack_index,
    };
  }
  throw new Error(`item ${row.id} has an invalid persisted location`);
}
