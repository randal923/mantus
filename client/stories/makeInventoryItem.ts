import type { EquipmentSlot, InventoryItem } from "@tibia/protocol";

export function makeInventoryItem(input: {
  id: string;
  clientId: number;
  spriteId: number;
  name: string;
  count: number;
  stackable?: boolean;
  maxCount?: number;
  equipmentSlot?: EquipmentSlot;
}): InventoryItem {
  return {
    ...input,
    typeId: input.clientId,
    stackable: input.stackable ?? input.count > 1,
    maxCount: input.maxCount ?? (input.stackable || input.count > 1 ? 100 : 1),
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
