import type { EquipmentSlot } from "@tibia/protocol";
import type { ItemLocation } from "../item/ItemLocation";

export interface DepotItemRow {
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
  world_x: number | null;
  world_y: number | null;
  world_z: number | null;
  world_stack_index: number | null;
  seed_key: string | null;
  depot_id: number | null;
}
