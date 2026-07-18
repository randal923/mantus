import type { Item } from "./Item";

/**
 * Rejects placements that would create a container cycle or nest containers
 * deeper than 8 levels.
 */
export function requireMemoryContainerPlacement(
  items: ReadonlyMap<string, Item>,
  itemId: string,
  destinationContainerId: string,
): void {
  let parent = items.get(destinationContainerId);
  for (let depth = 0; parent && depth < 8; depth++) {
    if (parent.id === itemId) throw new Error("item container cycle detected");
    parent =
      parent.location.kind === "container" ||
      parent.location.kind === "corpse"
        ? items.get(parent.location.containerId)
        : undefined;
  }
  if (parent) throw new Error("item container nesting exceeds 8 levels");
}
