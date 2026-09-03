import type { ContainerState } from "@tibia/protocol";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { projectItem } from "./projectItem";

/** Projects a world container root and its direct children for one viewer. */
export function projectWorldContainer(
  root: Item,
  children: ReadonlyArray<Item>,
  catalog: ItemCatalog,
): ContainerState {
  const slotOf = (item: Item): number =>
    item.location.kind === "container" || item.location.kind === "corpse"
      ? item.location.slot
      : 0;
  // A corpse holds every drop it rolled, so the window grows past the type's
  // slot count whenever the contents need it (Canary FLAG_NOLIMIT loot).
  const capacity = Math.max(
    catalog.require(root.typeId).containerCapacity ?? 0,
    ...children.map((item) => slotOf(item) + 1),
  );
  return {
    container: projectItem(root, catalog),
    parentContainerId: null,
    capacity,
    items: [...children]
      .sort((left, right) => slotOf(left) - slotOf(right))
      .map((item) => ({ slot: slotOf(item), item: projectItem(item, catalog) })),
  };
}
