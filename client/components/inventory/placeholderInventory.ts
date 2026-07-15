import type { Equipment, InventoryItem } from "./inventoryTypes";

interface PlaceholderInventory {
  characterName: string;
  equipment: Equipment;
  items: InventoryItem[];
  gold: number;
  platinum: number;
  capacityUsed: number;
  capacityMax: number;
}

// Display-only placeholder until the server sends real inventory state.
// All real inventory data and mutations will come from server messages.
export const PLACEHOLDER_INVENTORY: PlaceholderInventory = {
  characterName: "Hero",
  equipment: {
    helmet: { id: "eq-1", clientId: 3351, spriteId: 7837, name: "steel helmet", count: 1 },
    armor: { id: "eq-2", clientId: 3357, spriteId: 7843, name: "plate armor", count: 1 },
    weapon: { id: "eq-3", clientId: 3280, spriteId: 7749, name: "fire sword", count: 1 },
    backpack: { id: "eq-4", clientId: 2854, spriteId: 7137, name: "backpack", count: 1 },
  },
  items: [
    { id: "it-1", clientId: 3031, spriteId: 7384, name: "gold coin", count: 100 },
    { id: "it-2", clientId: 239, spriteId: 4344, name: "great health potion", count: 5 },
    { id: "it-3", clientId: 3577, spriteId: 8161, name: "meat", count: 3 },
  ],
  gold: 100,
  platinum: 0,
  capacityUsed: 62,
  capacityMax: 400,
};
