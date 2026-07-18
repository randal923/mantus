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
  return {
    container: projectItem(root, catalog),
    parentContainerId: null,
    capacity: catalog.require(root.typeId).containerCapacity ?? 0,
    items: [...children]
      .sort((left, right) => slotOf(left) - slotOf(right))
      .map((item) => ({ slot: slotOf(item), item: projectItem(item, catalog) })),
  };
}
