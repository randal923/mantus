import type { CarriedItemSummary, InventoryState } from "@tibia/protocol";
import { getInventoryItems } from "./getInventoryItems";

/**
 * Every item type the character carries, totalled by the server across
 * equipment and every container — open or closed. The action bar draws from
 * this so a rune sitting in a backpack the player never opened keeps its icon
 * and its count. Falls back to totalling the visible items for an inventory
 * that carries no summary (older state, stories, tests).
 */
export function getCarriedItems(
  inventory: InventoryState | null,
): ReadonlyArray<CarriedItemSummary> {
  if (inventory?.carried) return inventory.carried;
  const byType = new Map<number, CarriedItemSummary>();
  for (const item of getInventoryItems(inventory)) {
    const existing = byType.get(item.typeId);
    byType.set(
      item.typeId,
      existing
        ? { ...existing, count: existing.count + item.count }
        : {
            typeId: item.typeId,
            clientId: item.clientId,
            spriteId: item.spriteId,
            name: item.name,
            count: item.count,
            ...(item.equipmentSlot
              ? { equipmentSlot: item.equipmentSlot }
              : {}),
            ...(item.useKind ? { useKind: item.useKind } : {}),
          },
    );
  }
  return [...byType.values()];
}
