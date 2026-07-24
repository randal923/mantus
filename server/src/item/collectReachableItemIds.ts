import type { Item } from "./Item";

/**
 * Ids of items reachable from the character's equipment, following
 * container/corpse nesting up to 8 levels deep.
 */
export function collectReachableItemIds(
  items: ReadonlyArray<Item>,
  characterId: string,
): Set<string> {
  const reachable = new Set<string>();
  const childrenByContainer = new Map<string, Item[]>();
  for (const item of items) {
    if (
      item.location.kind === "equipment" &&
      item.location.characterId === characterId
    ) {
      reachable.add(item.id);
      continue;
    }
    if (
      item.location.kind === "container" ||
      item.location.kind === "corpse"
    ) {
      const children = childrenByContainer.get(item.location.containerId);
      if (children) children.push(item);
      else childrenByContainer.set(item.location.containerId, [item]);
    }
  }
  let frontier = [...reachable];
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const containerId of frontier) {
      for (const child of childrenByContainer.get(containerId) ?? []) {
        if (reachable.has(child.id)) continue;
        reachable.add(child.id);
        next.push(child.id);
      }
    }
    frontier = next;
  }
  return reachable;
}
