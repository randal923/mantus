import type {
  EquipmentSlot,
  InventoryItem as ProtocolInventoryItem,
  InventoryState,
} from "@tibia/protocol";

export type InventoryItem = ProtocolInventoryItem;
export type EquipmentSlotId = EquipmentSlot;
export type Equipment = InventoryState["equipment"];
