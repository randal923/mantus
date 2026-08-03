/**
 * Item types this server adds beyond the pinned Tibia asset pack, and the
 * stock appearance each one borrows to draw itself.
 *
 * The sprite pack is ripped from Tibia.dat and ends at appearance 51,950 — a
 * custom item cannot invent a sprite. So a custom type takes an id above that
 * range and *aliases* an existing appearance: the client registers the alias
 * when it loads `objects.json`, and every id that reaches it (inventory icon,
 * ground stack, look target) resolves like any stock item.
 *
 * It lives in the protocol package because both sides must agree on the same
 * pairs: the server mints catalog entries for these ids, the client must be
 * able to draw them. Only the appearance is shared — names, charges, prices
 * and behaviour stay server-side.
 */
export interface CustomItemAppearance {
  /** The custom item type id, above the ripped appearance range. */
  readonly typeId: number;
  /** The stock appearance it renders as. */
  readonly appearanceOf: number;
  /**
   * Recolours the borrowed art, so a tier that copies a stock sprite still
   * reads as its own thing in a slot. Exercise weapons animate a magenta spark
   * crawling along the weapon; a tint swaps that spark's hue and leaves the
   * weapon itself alone. Decoration: it says nothing the player cannot
   * already see by looking at the item.
   */
  readonly tint?: CustomItemTint;
}

export type CustomItemTint = "purple" | "dark-orange";

export const CUSTOM_ITEM_APPEARANCES: ReadonlyArray<CustomItemAppearance> = [
  // Epic exercise weapons, drawn as their lasting counterparts.
  { typeId: 60_001, appearanceOf: 50_295, tint: "purple" },
  { typeId: 60_002, appearanceOf: 35_285, tint: "purple" },
  { typeId: 60_003, appearanceOf: 35_286, tint: "purple" },
  { typeId: 60_004, appearanceOf: 35_287, tint: "purple" },
  { typeId: 60_005, appearanceOf: 44_067, tint: "purple" },
  { typeId: 60_006, appearanceOf: 35_288, tint: "purple" },
  { typeId: 60_007, appearanceOf: 35_289, tint: "purple" },
  { typeId: 60_008, appearanceOf: 35_290, tint: "purple" },
  // Legendary exercise weapons.
  { typeId: 60_101, appearanceOf: 50_295, tint: "dark-orange" },
  { typeId: 60_102, appearanceOf: 35_285, tint: "dark-orange" },
  { typeId: 60_103, appearanceOf: 35_286, tint: "dark-orange" },
  { typeId: 60_104, appearanceOf: 35_287, tint: "dark-orange" },
  { typeId: 60_105, appearanceOf: 44_067, tint: "dark-orange" },
  { typeId: 60_106, appearanceOf: 35_288, tint: "dark-orange" },
  { typeId: 60_107, appearanceOf: 35_289, tint: "dark-orange" },
  { typeId: 60_108, appearanceOf: 35_290, tint: "dark-orange" },
];
