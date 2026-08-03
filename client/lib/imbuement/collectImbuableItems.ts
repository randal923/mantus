import type { InventoryItem, InventoryState } from "@tibia/protocol";
import { itemImbuementSlotCountOf } from "../forge/itemImbuementSlotCountOf";

export interface ImbuableItem {
  readonly item: InventoryItem;
  readonly equipped: boolean;
}

/**
 * The carried pieces the shrine offers, worn ones first. Containers only
 * qualify while worn: spare backpacks nested in a bag are carried too, and
 * listing them buries the bag the player actually wears. Advisory only — the
 * server re-checks the item when the window is requested and again on apply.
 */
export function collectImbuableItems(
  inventory: InventoryState | null,
): ReadonlyArray<ImbuableItem> {
  if (!inventory) return [];
  const worn = new Set(
    Object.values(inventory.equipment)
      .filter((item): item is InventoryItem => item !== undefined)
      .map((item) => item.id),
  );
  // Keyed by item id: the worn backpack's contents arrive both as the
  // inventory's own slots and as an open container.
  const imbuable = new Map<string, ImbuableItem>();
  const consider = (item: InventoryItem) => {
    if (imbuable.has(item.id)) return;
    if (itemImbuementSlotCountOf(item) === 0) return;
    const equipped = worn.has(item.id);
    if (item.containerCapacity !== undefined && !equipped) return;
    imbuable.set(item.id, { item, equipped });
  };

  for (const item of Object.values(inventory.equipment)) {
    if (item) consider(item);
  }
  for (const entry of inventory.items) consider(entry.item);
  for (const container of inventory.containers ?? []) {
    for (const entry of container.items) consider(entry.item);
  }
  return [...imbuable.values()];
}
