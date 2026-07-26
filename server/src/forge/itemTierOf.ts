import type { Item } from "../item/Item";

/** Forge tier stored in the item's attribute bag; 0 when untiered. */
export function itemTierOf(item: Item): number {
  const tier = item.attributes.tier;
  if (typeof tier !== "number" || !Number.isInteger(tier) || tier < 0) return 0;
  return Math.min(10, tier);
}
