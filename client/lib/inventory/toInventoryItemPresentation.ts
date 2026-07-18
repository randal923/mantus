import type { InventoryItemPresentation } from "@tibia/protocol";

interface ItemPredictionSource {
  readonly itemTypeId: number;
  readonly clientId: number;
  readonly spriteId: number;
  readonly name: string;
  readonly stackable: boolean;
  readonly maxCount: number;
  readonly weight: number;
  readonly stowable?: boolean;
}

export function toInventoryItemPresentation(
  item: ItemPredictionSource,
): InventoryItemPresentation {
  return {
    typeId: item.itemTypeId,
    clientId: item.clientId,
    spriteId: item.spriteId,
    name: item.name,
    stackable: item.stackable,
    maxCount: item.maxCount,
    ...(item.stowable ? { stowable: true } : {}),
    tooltip: {
      name: item.name,
      typeLine: "Item",
      spriteId: item.spriteId,
      affixes: [],
      weight: item.weight,
    },
  };
}
