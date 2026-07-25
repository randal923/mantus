import type { Item } from "../item/Item";

const MAX_CONTAINER_DEPTH = 8;

/**
 * Free slots across the equipped backpack and every container nested inside
 * it — the same destinations `BackpackSlotLocker` locks inside the
 * transaction, so the tick precheck and the committed grant agree on whether
 * new rows will fit.
 */
export function countFreeBackpackSlots(
  items: ReadonlyArray<Item>,
  containerCapacityOf: (typeId: number) => number | undefined,
): number {
  const backpack = items.find(
    (item) =>
      item.location.kind === "equipment" && item.location.slot === "backpack",
  );
  if (!backpack) return 0;
  const childrenByContainer = new Map<string, Item[]>();
  for (const item of items) {
    if (item.location.kind !== "container") continue;
    const siblings = childrenByContainer.get(item.location.containerId) ?? [];
    siblings.push(item);
    childrenByContainer.set(item.location.containerId, siblings);
  }
  let free = 0;
  let frontier = [backpack];
  for (let depth = 0; depth < MAX_CONTAINER_DEPTH && frontier.length > 0; depth++) {
    const next: Item[] = [];
    for (const container of frontier) {
      const capacity = containerCapacityOf(container.typeId);
      if (capacity === undefined) continue;
      const children = childrenByContainer.get(container.id) ?? [];
      free += Math.max(0, capacity - children.length);
      next.push(...children);
    }
    frontier = next;
  }
  return free;
}
