import type { Item } from "../item/Item";
import type { ShopItemSubtype } from "./ShopStore";

export function itemHasShopSubtype(
  item: Item,
  subtype?: ShopItemSubtype,
): boolean {
  if (!subtype) return true;
  const key = subtype.kind === "charges" ? "charges" : "fluidType";
  return item.attributes[key] === subtype.value;
}
