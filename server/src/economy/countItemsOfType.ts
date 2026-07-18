import type { Item } from "../item/Item";

export function countItemsOfType(
  items: ReadonlyArray<Item>,
  typeId: number,
): number {
  return items
    .filter((item) => item.typeId === typeId)
    .reduce((total, item) => total + item.count, 0);
}
