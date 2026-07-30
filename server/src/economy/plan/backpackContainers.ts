import type { Item } from "../../item/Item";
import type { ItemCatalog } from "../../item/ItemCatalog";

const MAX_CONTAINER_DEPTH = 8;

export interface BackpackContainerView {
  readonly containerId: string;
  readonly capacity: number;
  /** Slots already taken; grants add to this as they claim destinations. */
  readonly occupiedSlots: Set<number>;
}

/**
 * The equipped backpack and every container nested inside it, depth-first in
 * slot order — the same fill order `BackpackSlotLocker` produces inside a
 * transaction, so a memory-first grant places rows exactly where the DB-first
 * path would have. Returns null when no equipped backpack can hold anything.
 */
export function backpackContainers(
  catalog: ItemCatalog,
  items: ReadonlyArray<Item>,
): ReadonlyArray<BackpackContainerView> | null {
  const backpack = items.find(
    (item) =>
      item.location.kind === "equipment" && item.location.slot === "backpack",
  );
  if (!backpack) return null;
  const childrenByContainer = new Map<string, Item[]>();
  for (const item of items) {
    if (item.location.kind !== "container") continue;
    const siblings = childrenByContainer.get(item.location.containerId) ?? [];
    siblings.push(item);
    childrenByContainer.set(item.location.containerId, siblings);
  }
  const containers: BackpackContainerView[] = [];
  const collect = (container: Item, depth: number): void => {
    if (depth >= MAX_CONTAINER_DEPTH) return;
    const capacity = catalog.require(container.typeId).containerCapacity;
    if (capacity === undefined) return;
    const children = [...(childrenByContainer.get(container.id) ?? [])].sort(
      (left, right) => slotOf(left) - slotOf(right),
    );
    containers.push({
      containerId: container.id,
      capacity,
      occupiedSlots: new Set(children.map(slotOf)),
    });
    for (const child of children) collect(child, depth + 1);
  };
  collect(backpack, 0);
  return containers.length === 0 ? null : containers;
}

function slotOf(item: Item): number {
  return item.location.kind === "container" ? item.location.slot : 0;
}
