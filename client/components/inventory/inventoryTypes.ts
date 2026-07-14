export interface InventoryItem {
  id: string;
  clientId: number;
  spriteId: number;
  name: string;
  count: number;
}

export type EquipmentSlotId =
  | "helmet"
  | "amulet"
  | "backpack"
  | "armor"
  | "weapon"
  | "shield"
  | "legs"
  | "boots"
  | "ring"
  | "ammo";

export type Equipment = Partial<Record<EquipmentSlotId, InventoryItem>>;
