import type { Item } from "./Item";

export interface ItemMutation {
  readonly before: Item;
  readonly after: ReadonlyArray<Item>;
  readonly removedItemIds?: ReadonlyArray<string>;
}
