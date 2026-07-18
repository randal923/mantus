import type { MarketCategory } from "@tibia/protocol";
import type { ItemType } from "../item/ItemType";

const CATEGORY_BY_PRIMARY_TYPE: ReadonlyMap<string, MarketCategory> = new Map([
  ["club weapons", "weapons"],
  ["sword weapons", "weapons"],
  ["axe weapons", "weapons"],
  ["distance weapons", "weapons"],
  ["fist weapons", "weapons"],
  ["wands", "weapons"],
  ["rods", "weapons"],
  ["ammunition", "weapons"],
  ["quivers", "weapons"],
  ["armors", "armor"],
  ["helmets", "armor"],
  ["helmet", "armor"],
  ["legs", "armor"],
  ["boots", "armor"],
  ["amulets and necklaces", "armor"],
  ["rings", "armor"],
  ["shields", "shields"],
  ["spellbooks", "spellbooks"],
  ["food", "consumables"],
  ["attack runes", "runes"],
  ["support runes", "runes"],
  ["healing runes", "runes"],
  ["valuables", "valuables"],
  ["creature products", "valuables"],
]);

/**
 * Marketability is server-derived: a type trades on the market only when it
 * maps to a category here and is a plain, carryable item. Coins (`worth`) and
 * containers are excluded so gold cannot be listed against itself and nested
 * inventories cannot hide state inside escrow.
 */
export function marketCategoryOf(type: ItemType): MarketCategory | null {
  if (!type.pickupable || !type.movable) return null;
  if (type.worth !== undefined) return null;
  if (type.containerCapacity !== undefined) return null;
  if (type.kind !== undefined) return null;
  if (type.primaryType === undefined) return null;
  return CATEGORY_BY_PRIMARY_TYPE.get(type.primaryType) ?? null;
}
