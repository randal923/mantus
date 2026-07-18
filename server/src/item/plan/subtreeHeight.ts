import type { Item } from "../Item";

/** Nesting height of an item's subtree; a childless item has height 1. */
export function subtreeHeight(
  items: ReadonlyArray<Item>,
  rootId: string,
): number {
  const byContainer = new Map<string, string[]>();
  for (const item of items) {
    if (
      item.location.kind !== "container" &&
      item.location.kind !== "corpse"
    ) {
      continue;
    }
    const children = byContainer.get(item.location.containerId) ?? [];
    children.push(item.id);
    byContainer.set(item.location.containerId, children);
  }
  let height = 0;
  let frontier = [rootId];
  for (let depth = 0; depth < 9 && frontier.length > 0; depth++) {
    height = depth + 1;
    frontier = frontier.flatMap(
      (containerId) => byContainer.get(containerId) ?? [],
    );
  }
  return height;
}
