import type { Item } from "./Item";

/**
 * Returns the item when it matches the expected version and its container
 * chain (up to 8 levels) roots at the character's equipment.
 */
export function requireOwnedMemoryItem(
  items: ReadonlyMap<string, Item>,
  characterId: string,
  itemId: string,
  expectedVersion: number,
): Item {
  const item = items.get(itemId);
  if (!item || item.version !== expectedVersion) {
    throw new Error("item is missing or stale");
  }
  let root = item;
  for (let depth = 0; depth < 8; depth++) {
    if (
      root.location.kind === "equipment" &&
      root.location.characterId === characterId
    ) {
      return item;
    }
    if (
      root.location.kind !== "container" &&
      root.location.kind !== "corpse"
    ) {
      break;
    }
    const parent = items.get(root.location.containerId);
    if (!parent) break;
    root = parent;
  }
  throw new Error("item is not owned by character");
}
