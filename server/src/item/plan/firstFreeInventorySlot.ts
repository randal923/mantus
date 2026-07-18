import type { Item } from "../Item";

/** First free loose-inventory slot (0-99), or null when staging is full. */
export function firstFreeInventorySlot(
  items: ReadonlyArray<Item>,
): number | null {
  const occupied = new Set(
    items.flatMap((item) =>
      item.location.kind === "inventory" ? [item.location.slot] : [],
    ),
  );
  for (let slot = 0; slot < 100; slot++) {
    if (!occupied.has(slot)) return slot;
  }
  return null;
}
