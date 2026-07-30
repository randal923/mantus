import type { Item } from "./Item";

export interface InventoryCache {
  readonly capacityMax: number;
  readonly items: ReadonlyArray<Item>;
  readonly revision: number;
  readonly openContainerIds: ReadonlySet<string>;
  /**
   * The character's bank balance, held here so money and items share one
   * lifecycle: a purchase that pays partly from the bank plans both legs from
   * this snapshot. Not part of the client projection — the balance travels in
   * `bank-updated`, so changing it alone leaves `revision` untouched and keeps
   * the projection and the items-keyed memoizations valid.
   */
  readonly bankBalance: number;
}
