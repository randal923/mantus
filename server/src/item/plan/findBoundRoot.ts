import type { Item } from "../Item";

/** The character-bound items container: the equipment row in the `bound` slot. */
export function findBoundRoot(items: ReadonlyArray<Item>): Item | undefined {
  return items.find(
    (item) =>
      item.location.kind === "equipment" && item.location.slot === "bound",
  );
}
