import type { InventoryItem, InventoryState } from "@tibia/protocol";

/** Finds an item anywhere in the projected inventory: equipment, backpack grid, or open containers. */
export function findInventoryItem(
  inventory: InventoryState,
  itemId: string,
): InventoryItem | null {
  for (const item of Object.values(inventory.equipment)) {
    if (item?.id === itemId) return item;
  }
  for (const entry of inventory.items) {
    if (entry.item.id === itemId) return entry.item;
  }
  for (const container of inventory.containers ?? []) {
    if (container.container.id === itemId) return container.container;
    for (const entry of container.items) {
      if (entry.item.id === itemId) return entry.item;
    }
  }
  return null;
}
