import type { Item } from "../item/Item";

/**
 * The offered item and every item nested inside it, breadth-first with root
 * first (depth 0) — the same flat ordering Canary's trade windows send.
 */
export function tradeOfferSubtree(
  items: ReadonlyArray<Item>,
  rootId: string,
): Array<{ item: Item; depth: number }> {
  const root = items.find((item) => item.id === rootId);
  if (!root) return [];
  const byContainer = new Map<string, Item[]>();
  for (const item of items) {
    if (
      item.location.kind !== "container" &&
      item.location.kind !== "corpse"
    ) {
      continue;
    }
    const children = byContainer.get(item.location.containerId) ?? [];
    children.push(item);
    byContainer.set(item.location.containerId, children);
  }
  const result: Array<{ item: Item; depth: number }> = [];
  let frontier = [root];
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const next: Item[] = [];
    for (const item of frontier) {
      result.push({ item, depth });
      for (const child of byContainer.get(item.id) ?? []) next.push(child);
    }
    frontier = next;
  }
  return result;
}
