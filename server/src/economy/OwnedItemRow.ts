import type { EquipmentSlot } from "@tibia/protocol";
import type { ItemLocation } from "../item/ItemLocation";

/** Raw `items` row shape read by the economy stores' owned-items query. */
export interface OwnedItemRow {
  id: string;
  item_type_id: number;
  count: number;
  attributes: unknown;
  version: number;
  location_type: ItemLocation["kind"];
  character_id: string | null;
  container_id: string | null;
  slot_index: number | null;
  equipment_slot: EquipmentSlot | null;
  seed_key: string | null;
}
