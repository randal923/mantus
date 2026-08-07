import type {
  StoreCategory,
  StoreIcon,
  StoreProduct,
  StoreProductKind,
} from "@tibia/protocol";

import { EXERCISE_WEAPON_CATEGORY } from "./EXERCISE_WEAPON_CATEGORY";
import { STORE_CATALOG_CATEGORIES } from "./storeCatalogData";

/**
 * The catalog's own icon, which names an item *type*; the projection below
 * turns that into the sprite the client draws.
 */
export type StoreCatalogIcon =
  | { readonly kind: "item"; readonly itemTypeId: number }
  | Exclude<StoreIcon, { kind: "item" }>;

/**
 * The pinned store catalog, imported from Canary by
 * tools/importCanaryStoreCatalog.mjs. It is the outer bound on what the store
 * can ever sell: a purchase names a sub-offer id and the server reads price,
 * product and grant from here, so no price, count or product detail ever
 * comes off the wire (charter rule 1).
 *
 * `StoreGrant` is deliberately server-only. The client sees a product's kind,
 * icon and price; it never sees which look type, item id or slot a purchase
 * will touch beyond what the icon already shows.
 */
export type StoreGrant =
  | { readonly kind: "premium"; readonly days: number }
  | {
      readonly kind: "outfit" | "outfit-addon";
      readonly male: number;
      readonly female: number;
      readonly addons: number;
    }
  | { readonly kind: "mount"; readonly mountId: number }
  | {
      readonly kind: "item" | "stackable";
      readonly itemTypeId: number;
      readonly count: number;
      /** Canary's ITEM_UNIQUE: refused when the character already owns one. */
      readonly unique: boolean;
    }
  | {
      readonly kind: "charges";
      readonly itemTypeId: number;
      readonly charges: number;
    }
  | {
      /**
       * House furniture sold as wrapped decoration kits, Canary's
       * OFFER_TYPE_HOUSE: the buyer receives `count` kits that unwrap into
       * `itemTypeId` on an owned house tile.
       */
      readonly kind: "house-item";
      readonly itemTypeId: number;
      readonly count: number;
    }
  | { readonly kind: "prey-wildcard"; readonly count: number }
  | {
      readonly kind:
        | "name-change"
        | "sex-change"
        | "exp-boost"
        | "prey-slot"
        | "hunting-slot"
        | "temple-teleport";
    };

export interface StoreCatalogSubOffer {
  readonly id: string;
  readonly price: number;
  /** Units delivered, shown as "250x" on the price button. */
  readonly count?: number;
  readonly grant: StoreGrant;
}

export interface StoreCatalogProduct {
  readonly id: string;
  readonly name: string;
  readonly kind: StoreProductKind;
  readonly description: string;
  readonly icon: StoreCatalogIcon;
  readonly subOffers: ReadonlyArray<StoreCatalogSubOffer>;
}

export interface StoreCatalogCategory {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly icon: StoreCatalogIcon;
  readonly products: ReadonlyArray<StoreCatalogProduct>;
}

/**
 * The imported catalog with this server's own shelves substituted in place, so
 * a deviation from Canary is one named module rather than an edit to generated
 * data. Substituting keeps the category where the import put it, which is what
 * the client's tree order follows.
 */
export const STORE_CATEGORIES: ReadonlyArray<StoreCatalogCategory> =
  STORE_CATALOG_CATEGORIES.map((category) =>
    category.id === EXERCISE_WEAPON_CATEGORY.id
      ? EXERCISE_WEAPON_CATEGORY
      : category,
  );

export const STORE_CATEGORIES_BY_ID: ReadonlyMap<string, StoreCatalogCategory> =
  new Map(STORE_CATEGORIES.map((category) => [category.id, category]));

export const STORE_PRODUCTS_BY_ID: ReadonlyMap<string, StoreCatalogProduct> =
  new Map(
    STORE_CATEGORIES.flatMap((category) =>
      category.products.map(
        (product) => [product.id, product] as const,
      ),
    ),
  );

/** Every purchasable offer, keyed by the id a purchase message may name. */
export const STORE_OFFERS_BY_ID: ReadonlyMap<
  string,
  { readonly product: StoreCatalogProduct; readonly offer: StoreCatalogSubOffer }
> = new Map(
  STORE_CATEGORIES.flatMap((category) =>
    category.products.flatMap((product) =>
      product.subOffers.map(
        (offer) => [offer.id, { product, offer }] as const,
      ),
    ),
  ),
);

/**
 * The landing page. Canary picks featured offers per category; here it is one
 * representative product from each top-level area, which is what the store's
 * "Recently Added" panel shows.
 */
export const STORE_HOME_PRODUCT_IDS: ReadonlyArray<string> = [
  "premium-time",
  "boosts-xp-boost",
  "outfits-full-arbalester-outfit",
  "mounts-armoured-war-horse",
  "potions-great-health-potion",
  "useful-things-item-pouch",
];

/** The category tree, as the client's left-hand list needs it. */
export function storeCategoryTree(
  itemIconOf: (itemTypeId: number) => StoreItemIconIds,
): StoreCategory[] {
  return STORE_CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    icon: toStoreIcon(category.icon, itemIconOf),
  }));
}

/** The ids an item icon carries: its atlas sprite and its appearance. */
export interface StoreItemIconIds {
  readonly spriteId: number;
  readonly clientId: number;
}

/** Resolves an item icon's ids; other icon kinds pass through unchanged. */
function toStoreIcon(
  icon: StoreCatalogIcon,
  itemIconOf: (itemTypeId: number) => StoreItemIconIds,
): StoreIcon {
  return icon.kind === "item"
    ? { kind: "item", ...itemIconOf(icon.itemTypeId) }
    : icon;
}

/**
 * Per-player facts about one offer, computed fresh each time a list is drawn:
 * why it cannot be bought, and — for the XP boost, whose price escalates with
 * the day's purchases — what it currently costs.
 */
export interface StoreOfferAdjustment {
  readonly price?: number;
  readonly disabledReason?: string;
}

/**
 * Strips the server-only grant, leaving what a list message may carry, and
 * resolves an item icon's sprite from the pinned catalog — the client renders
 * by sprite id and should not have to map type ids itself.
 */
export function toStoreProduct(
  product: StoreCatalogProduct,
  adjustments: ReadonlyMap<string, StoreOfferAdjustment>,
  itemIconOf: (itemTypeId: number) => StoreItemIconIds,
): StoreProduct {
  return {
    id: product.id,
    name: product.name,
    kind: product.kind,
    icon: toStoreIcon(product.icon, itemIconOf),
    subOffers: product.subOffers.map((offer) => {
      const adjustment = adjustments.get(offer.id);
      return {
        id: offer.id,
        price: adjustment?.price ?? offer.price,
        ...(offer.count === undefined ? {} : { count: offer.count }),
        ...(adjustment?.disabledReason === undefined
          ? {}
          : { disabled: true, disabledReason: adjustment.disabledReason }),
      };
    }),
  };
}
