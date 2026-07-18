import type { Item } from "./Item";

export interface InventoryCache {
  readonly capacityMax: number;
  readonly items: ReadonlyArray<Item>;
  readonly revision: number;
  readonly openContainerIds: ReadonlySet<string>;
}
