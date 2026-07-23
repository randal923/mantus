import type { InventoryItem, InventoryState } from "@tibia/protocol";

export function getInventoryItems(
  inventory: InventoryState | null,
): ReadonlyArray<InventoryItem> {
  if (!inventory) return [];
  return [
    ...Object.values(inventory.equipment).filter(
      (item): item is InventoryItem => item !== undefined,
    ),
    ...inventory.items.map((entry) => entry.item),
    ...(inventory.containers ?? []).flatMap((container) =>
      container.items.map((entry) => entry.item),
    ),
  ];
}
