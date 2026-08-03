/**
 * Charges left on an item. Items minted before they carried an explicit
 * `charges` attribute (shop stock, GM grants) fall back to the catalog's
 * full charge count, which is how Canary's items.xml default behaves.
 *
 * Takes the attribute bag rather than a whole `Item` so a look at a tile —
 * which only ever holds the bag — counts the same way an inventory tooltip
 * does.
 */
export function chargesOf(
  item: { readonly attributes: Readonly<Record<string, unknown>> },
  catalogCharges: number | undefined,
): number {
  const stored = item.attributes.charges;
  if (typeof stored === "number" && Number.isInteger(stored) && stored >= 0) {
    return stored;
  }
  return catalogCharges ?? 0;
}
