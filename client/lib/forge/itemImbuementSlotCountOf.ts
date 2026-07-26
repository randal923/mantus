import type { InventoryItem } from "@tibia/protocol";

const IMBUEMENT_SLOTS_AFFIX = /^Imbuement Slots (\d+)$/;

/**
 * Reads the imbuement slot count from the server-authored tooltip affix.
 * Only used to decide whether to offer the "imbue" action; the server
 * validates the item again when the window is requested.
 */
export function itemImbuementSlotCountOf(item: InventoryItem): number {
  for (const affix of item.tooltip.affixes) {
    const match = IMBUEMENT_SLOTS_AFFIX.exec(affix.text);
    if (match) return Number(match[1]);
  }
  return 0;
}
