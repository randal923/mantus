import { PORTABLE_SELLER_TYPE_ID } from "@tibia/protocol";
import type { StoreCatalogProduct } from "./storeCatalog";

/**
 * This server's own store product (no Canary counterpart): the Portable
 * Seller, which vendors the loot pouch's contents — automatically every ten
 * minutes and on use with a one-minute cooldown. Hand-authored here so
 * regenerating the imported catalog never drops it; spliced into the
 * useful-things category by storeCatalog.ts.
 */
export const PORTABLE_SELLER_PRODUCT: StoreCatalogProduct = {
  id: "useful-things-portable-seller",
  name: "Portable Seller",
  kind: "item",
  description:
    "Sells every item inside your loot pouch to the highest-paying NPC and " +
    "wires the gold straight to your bank account.\nTriggers automatically " +
    "every 10 minutes.\nUse it to trigger a sale yourself, at most once per " +
    "minute.\nRarity-graded items are never sold automatically.\n{character}",
  icon: { kind: "item", itemTypeId: PORTABLE_SELLER_TYPE_ID },
  subOffers: [
    {
      id: `item-${PORTABLE_SELLER_TYPE_ID}-1`,
      price: 900,
      count: 1,
      grant: {
        kind: "item",
        itemTypeId: PORTABLE_SELLER_TYPE_ID,
        count: 1,
        unique: true,
      },
    },
  ],
};
