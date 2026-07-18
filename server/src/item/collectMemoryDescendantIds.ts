import type { Item } from "./Item";

/** Children in slots >= keepSlots plus their whole subtrees, depth-capped at 8. */
export function collectMemoryDescendantIds(
  items: ReadonlyMap<string, Item>,
  rootId: string,
  keepSlots = 0,
): string[] {
  const removed: string[] = [];
  let parents = new Set([rootId]);
  for (let depth = 0; depth < 8 && parents.size > 0; depth++) {
    const next = new Set<string>();
    for (const item of items.values()) {
      if (
        item.location.kind !== "container" &&
        item.location.kind !== "corpse"
      ) {
        continue;
      }
      if (!parents.has(item.location.containerId)) continue;
      if (
        depth === 0 &&
        item.location.containerId === rootId &&
        item.location.slot < keepSlots
      ) {
        continue;
      }
      removed.push(item.id);
      next.add(item.id);
    }
    parents = next;
  }
  return removed;
}
