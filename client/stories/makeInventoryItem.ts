import type { EquipmentSlot, InventoryItem } from "@tibia/protocol";

export function makeInventoryItem(input: {
  id: string;
  clientId: number;
  spriteId: number;
  name: string;
  count: number;
  equipmentSlot?: EquipmentSlot;
}): InventoryItem {
  return {
    ...input,
    typeId: input.clientId,
    revision: 1,
    tooltip: {
      name: input.name,
      typeLine: "Tibia Item",
      spriteId: input.spriteId,
      affixes: [],
      weight: 0,
    },
  };
}
