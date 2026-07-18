import type { Item } from "./Item";

/**
 * Ids of items reachable from the character's equipment/inventory, following
 * container/corpse nesting up to 8 levels deep.
 */
export function collectReachableItemIds(
  items: ReadonlyArray<Item>,
  characterId: string,
): Set<string> {
  const reachable = new Set(
    items
      .filter(
        (item) =>
          (item.location.kind === "equipment" ||
            item.location.kind === "inventory") &&
          item.location.characterId === characterId,
      )
      .map((item) => item.id),
  );
  for (let depth = 0; depth < 8; depth++) {
    let changed = false;
    for (const item of items) {
      if (
        (item.location.kind === "container" ||
          item.location.kind === "corpse") &&
        reachable.has(item.location.containerId) &&
        !reachable.has(item.id)
      ) {
        reachable.add(item.id);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return reachable;
}
