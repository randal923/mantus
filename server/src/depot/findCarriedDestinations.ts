import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { InventoryDestination } from "./InventoryDestination";

/**
 * Free equipped-backpack slots for withdrawn items.
 */
export function findCarriedDestinations(
  catalog: ItemCatalog,
  carried: ReadonlyArray<Item>,
  count: number,
): InventoryDestination[] {
  const backpack = carried.find(
    (item) =>
      item.location.kind === "equipment" && item.location.slot === "backpack",
  );
  if (!backpack) return [];
  const capacity = catalog.require(backpack.typeId).containerCapacity;
  if (capacity === undefined) {
    throw new Error("equipped backpack is not a container");
  }
  const occupied = new Set(
    carried.flatMap((item) =>
      (item.location.kind === "container" ||
        item.location.kind === "corpse") &&
      item.location.containerId === backpack.id
        ? [item.location.slot]
        : [],
    ),
  );
  return Array.from({ length: capacity }, (_, slot) => slot)
    .filter((slot) => !occupied.has(slot))
    .slice(0, count)
    .map((slot) => ({
      kind: "container" as const,
      containerId: backpack.id,
      slot,
    }));
}
