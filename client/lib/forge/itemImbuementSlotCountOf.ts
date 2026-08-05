import type { InventoryItem } from "@tibia/protocol";

/**
 * Imbuement slot count from the tooltip's structured field. Only used to
 * decide whether to offer the "imbue" action; the server validates the item
 * again when the window is requested.
 */
export function itemImbuementSlotCountOf(item: InventoryItem): number {
  return item.tooltip.imbuementSlots ?? 0;
}
