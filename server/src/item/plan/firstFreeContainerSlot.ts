import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";

/** First free slot inside a container, or null when it is full. */
export function firstFreeContainerSlot(
  catalog: ItemCatalog,
  items: ReadonlyArray<Item>,
  container: Item,
): number | null {
  const capacity = catalog.require(container.typeId).containerCapacity ?? 0;
  const occupied = new Set(
    items.flatMap((item) =>
      (item.location.kind === "container" || item.location.kind === "corpse") &&
      item.location.containerId === container.id
        ? [item.location.slot]
        : [],
    ),
  );
  for (let slot = 0; slot < capacity; slot++) {
    if (!occupied.has(slot)) return slot;
  }
  return null;
}
