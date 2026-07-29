import type { Item } from "./Item";

/**
 * Charges left on an item. Items minted before they carried an explicit
 * `charges` attribute (shop stock, GM grants) fall back to the catalog's
 * full charge count, which is how Canary's items.xml default behaves.
 */
export function chargesOf(item: Item, catalogCharges: number | undefined): number {
  const stored = item.attributes.charges;
  if (typeof stored === "number" && Number.isInteger(stored) && stored >= 0) {
    return stored;
  }
  return catalogCharges ?? 0;
}
