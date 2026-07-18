import type { Item } from "../item/Item";

/** Items nested inside `rootId` via container/corpse links, up to 8 levels. */
export function collectDescendantItems(
  items: ReadonlyArray<Item>,
  rootId: string,
): Item[] {
  const byContainer = new Map<string, Item[]>();
  for (const item of items) {
    if (
      item.location.kind !== "container" &&
      item.location.kind !== "corpse"
    ) {
      continue;
    }
    const siblings = byContainer.get(item.location.containerId) ?? [];
    siblings.push(item);
    byContainer.set(item.location.containerId, siblings);
  }
  const descendants: Item[] = [];
  let frontier = [rootId];
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const containerId of frontier) {
      for (const child of byContainer.get(containerId) ?? []) {
        descendants.push(child);
        next.push(child.id);
      }
    }
    frontier = next;
  }
  return descendants;
}
