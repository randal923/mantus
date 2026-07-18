import type { Item } from "../Item";

/**
 * The container/corpse chain from `start` up to its topmost carried ancestor,
 * start first — the memory mirror of the DB ancestry walk used for cycle and
 * nesting-depth checks.
 */
export function containerAncestryChain(
  itemsById: ReadonlyMap<string, Item>,
  start: Item,
): Item[] {
  const chain: Item[] = [];
  let current: Item | undefined = start;
  for (let depth = 0; depth < 10 && current; depth++) {
    chain.push(current);
    const location: Item["location"] = current.location;
    current =
      location.kind === "container" || location.kind === "corpse"
        ? itemsById.get(location.containerId)
        : undefined;
  }
  return chain;
}
