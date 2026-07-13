export interface InventoryItem {
  /** Unique item instance id (the server's item row id). */
  id: string;
  clientId: number;
  /** First sprite of the object — resolved from objects.json by the caller. */
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
