import type { ItemType } from "../item/ItemType";
import type { ShopEntry } from "./ShopCatalog";
import type { ShopItemSubtype } from "./ShopStore";

/**
 * Maps a catalog entry's raw subtype onto the item type: undefined when the
 * entry has none, null when the combination is invalid.
 */
export function resolveShopSubtype(
  entry: ShopEntry,
  type: ItemType,
): ShopItemSubtype | null | undefined {
  if (entry.subtype === undefined) return undefined;
  if (type.stackable) return null;
  if (type.charges !== undefined) {
    return { kind: "charges", value: entry.subtype };
  }
  if (
    (type.render.fluidContainer || type.render.splash) &&
    entry.subtype <= 255
  ) {
    return { kind: "fluid", value: entry.subtype };
  }
  return null;
}
