import type {
  InventoryItem,
  InventoryState,
  ItemContainerDestination,
} from "@tibia/protocol";

/**
 * Where ammunition dropped on an equipped quiver should land, Canary's
 * `movingAmmoToQuiver` (player.cpp queryDestination): onto a stack of the
 * same type with room, else the first free slot. A quiver the player has not
 * opened is unknown here, so the drop goes to the front and the server
 * decides. Null when the open quiver is visibly full.
 */
export function quiverDropDestination(
  inventory: InventoryState,
  quiver: InventoryItem,
  ammunition: Pick<InventoryItem, "typeId" | "maxCount">,
): Pick<ItemContainerDestination, "slot" | "placement"> | null {
  const open = (inventory.containers ?? []).find(
    (container) => container.container.id === quiver.id,
  );
  if (!open) return { slot: 0, placement: "front" };
  const merge = open.items.find(
    (entry) =>
      entry.item.typeId === ammunition.typeId &&
      entry.item.count < ammunition.maxCount,
  );
  if (merge) return { slot: merge.slot };
  const occupied = new Set(open.items.map((entry) => entry.slot));
  for (let slot = 0; slot < open.capacity; slot += 1) {
    if (!occupied.has(slot)) return { slot };
  }
  return null;
}
