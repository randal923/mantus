import { z } from "zod";

/**
 * Mantus Store protocol, transcribed from Canary's `data/libs/gamestore` and
 * shaped for the client layout the official store uses (see OTClient's
 * `modules/game_store`): a category tree on the left, and a product list where
 * one *product* — "Great Health Potion" — carries several priced *sub-offers*
 * ("100x for 18", "250x for 41").
 *
 * Two rules drive the shape:
 *
 *   * The catalog is pinned server-side. A purchase names a sub-offer id and
 *     nothing else; price, product, count and every delivery detail are read
 *     from the server's own catalog, never from the message (charter rule 1).
 *
 *   * Whether an offer is buyable is *also* the server's answer. Canary's
 *     `canBuyOffer` runs on the server and ships `disabled` + a reason, so
 *     the client greys the button but the server still re-checks at execution
 *     time (charter rules 4 and 8). None of it leaks anything the player
 *     cannot already see: it is their own wardrobe, their own slots.
 */
export const STORE_LIMITS = {
  maxBalance: 1_000_000_000_000,
  maxCategories: 32,
  /**
   * Products per page. Sized so one page fits the product list without an
   * inner scroll — the store reads as pages, not an endless feed — and it is
   * what keeps a category message inside `PROTOCOL_LIMITS.maxMessageBytes`:
   * the mount category alone has 140 products, so categories page rather
   * than over-share (charter rule 10). Canary uses 26 for its own denser
   * row layout.
   */
  productsPerPage: 12,
  maxPages: 64,
  maxSubOffersPerProduct: 8,
  /** Products on the store's landing page. */
  maxHomeProducts: 12,
  actionCooldownMs: 500,
  /** Coin-history page size; the server never returns more than this. */
  maxHistoryEntries: 50,
  maxDescriptionLength: 2_048,
  maxNameLength: 64,
} as const;

const mantusCoinBalanceSchema = z
  .number()
  .int()
  .min(0)
  .max(STORE_LIMITS.maxBalance);

const identifierSchema = z.string().min(1).max(64);

/**
 * What a product grants. The client renders by this and the server dispatches
 * delivery by it, so the two can never drift apart into "shown as an outfit,
 * delivered as an item".
 */
export const storeProductKindSchema = z.enum([
  "premium",
  "outfit",
  "outfit-addon",
  "mount",
  "item",
  "stackable",
  "charges",
  "house-item",
  "name-change",
  "sex-change",
  "exp-boost",
  "prey-slot",
  "prey-wildcard",
  "hunting-slot",
  "temple-teleport",
]);

/**
 * How to draw a product. Canary ships PNG filenames from CipSoft's store
 * pack, which we do not have; instead the server names something the client
 * can already render from its own sprite assets.
 */
export const storeIconSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("item"),
      /** Atlas sprite, resolved server-side from the pinned item catalog. */
      spriteId: z.number().int().min(1),
      /** Appearance id, so the icon can resolve its animation schedule. */
      clientId: z.number().int().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("outfit"),
      lookType: z.number().int().min(1).max(65_535),
      addons: z.number().int().min(0).max(3),
    })
    .strict(),
  z
    .object({
      kind: z.literal("mount"),
      lookType: z.number().int().min(1).max(65_535),
    })
    .strict(),
  z
    .object({
      kind: z.literal("symbol"),
      symbol: z.enum([
        "premium",
        "name-change",
        "sex-change",
        "exp-boost",
        "prey-wildcard",
        "prey-slot",
        "hunting",
        "temple",
      ]),
    })
    .strict(),
]);

/** One priced variant of a product — the thing a purchase actually names. */
export const storeSubOfferSchema = z
  .object({
    id: identifierSchema,
    price: z.number().int().positive().max(STORE_LIMITS.maxBalance),
    /** Units delivered, when the product has a quantity ("250x"). */
    count: z.number().int().min(1).max(10_000).optional(),
    /** Server's own answer to "can this character buy it right now". */
    disabled: z.boolean().optional(),
    disabledReason: z.string().max(160).optional(),
  })
  .strict();

/**
 * A product as it appears in a list. Descriptions are deliberately absent:
 * they run to hundreds of characters and a page of 26 would blow the message
 * cap, so the client asks for one when the player selects it — the same split
 * Canary makes between `S_StoreOffers` and `S_RequestPurchaseData`.
 */
export const storeProductSchema = z
  .object({
    id: identifierSchema,
    name: z.string().min(1).max(64),
    kind: storeProductKindSchema,
    icon: storeIconSchema,
    /** Canary's offer states; drives the "New"/"Sale" corner badge. */
    highlight: z.enum(["new", "sale"]).optional(),
    subOffers: z
      .array(storeSubOfferSchema)
      .min(1)
      .max(STORE_LIMITS.maxSubOffersPerProduct),
  })
  .strict();

export const storeCategorySchema = z
  .object({
    id: identifierSchema,
    name: z.string().min(1).max(48),
    /** null for a top-level category; otherwise its parent's id. */
    parentId: identifierSchema.nullable(),
    /**
     * Drawn from the same union products use. OTClient does not bundle
     * CipSoft's `Category_*.png` pack — it downloads it — so a category
     * borrows the icon of a product inside it, which is real Tibia art we
     * already ship.
     */
    icon: storeIconSchema,
  })
  .strict();

export const storeOpenMessageSchema = z
  .object({
    type: z.literal("store-open"),
  })
  .strict();

/** Asks for one page of a category; the tree came with `store-state`. */
export const storeCategoryMessageSchema = z
  .object({
    type: z.literal("store-category"),
    categoryId: identifierSchema,
    page: z.number().int().min(0).max(STORE_LIMITS.maxPages - 1),
  })
  .strict();

/** Asks for one product's long description, for the detail pane. */
export const storeDescriptionMessageSchema = z
  .object({
    type: z.literal("store-description"),
    productId: identifierSchema,
  })
  .strict();

/**
 * `newName` accompanies a name-change purchase only. It is validated and
 * uniqueness-checked server-side inside the purchase transaction; a name on
 * any other product is refused rather than ignored.
 */
export const storePurchaseMessageSchema = z
  .object({
    type: z.literal("store-purchase"),
    offerId: identifierSchema,
    newName: z.string().min(1).max(STORE_LIMITS.maxNameLength).optional(),
  })
  .strict();

export const storeHistoryMessageSchema = z
  .object({
    type: z.literal("store-history"),
  })
  .strict();

export const storeStateMessageSchema = z
  .object({
    type: z.literal("store-state"),
    balance: mantusCoinBalanceSchema,
    categories: z
      .array(storeCategorySchema)
      .max(STORE_LIMITS.maxCategories),
    /** The landing page's featured products. */
    home: z.array(storeProductSchema).max(STORE_LIMITS.maxHomeProducts),
  })
  .strict();

export const storeOffersMessageSchema = z
  .object({
    type: z.literal("store-offers"),
    categoryId: identifierSchema,
    page: z.number().int().min(0).max(STORE_LIMITS.maxPages - 1),
    pageCount: z.number().int().min(1).max(STORE_LIMITS.maxPages),
    products: z.array(storeProductSchema).max(STORE_LIMITS.productsPerPage),
  })
  .strict();

export const storeDescriptionStateMessageSchema = z
  .object({
    type: z.literal("store-description-state"),
    productId: identifierSchema,
    description: z.string().max(STORE_LIMITS.maxDescriptionLength),
  })
  .strict();

export const storePurchaseCompletedMessageSchema = z
  .object({
    type: z.literal("store-purchase-completed"),
    offerId: identifierSchema,
    balance: mantusCoinBalanceSchema,
    accountTier: z.enum(["free", "premium"]),
    premiumDaysRemaining: z.number().int().min(0).max(100_000),
    /** True when the product was delivered to the buyer's bound container. */
    deliveredToBound: z.boolean().optional(),
  })
  .strict();

export const storeHistoryEntrySchema = z
  .object({
    id: z.string().min(1).max(32),
    entryType: z.enum(["grant", "purchase", "refund"]),
    /** Signed: negative spends, positive credits. */
    amount: z
      .number()
      .int()
      .min(-STORE_LIMITS.maxBalance)
      .max(STORE_LIMITS.maxBalance),
    balanceAfter: mantusCoinBalanceSchema,
    offerId: identifierSchema.nullable(),
    occurredAt: z.string().datetime(),
  })
  .strict();

export const storeHistoryStateMessageSchema = z
  .object({
    type: z.literal("store-history-state"),
    balance: mantusCoinBalanceSchema,
    entries: z
      .array(storeHistoryEntrySchema)
      .max(STORE_LIMITS.maxHistoryEntries),
  })
  .strict();

export const storeActionFailedMessageSchema = z
  .object({
    type: z.literal("store-action-failed"),
    reason: z.enum([
      "insufficient-coins",
      "offer-not-found",
      "category-not-found",
      "premium-limit",
      "inbox-full",
      "already-owned",
      "outfit-required",
      "wrong-sex",
      "limit-reached",
      "name-taken",
      "name-invalid",
      "name-required",
      "in-combat",
      "rate-limited",
      "unavailable",
      "failed",
    ]),
  })
  .strict();

export type StoreProductKind = z.infer<typeof storeProductKindSchema>;
export type StoreIcon = z.infer<typeof storeIconSchema>;
export type StoreSubOffer = z.infer<typeof storeSubOfferSchema>;
export type StoreProduct = z.infer<typeof storeProductSchema>;
export type StoreCategory = z.infer<typeof storeCategorySchema>;
export type StoreOpenMessage = z.infer<typeof storeOpenMessageSchema>;
export type StoreCategoryMessage = z.infer<typeof storeCategoryMessageSchema>;
export type StoreDescriptionMessage = z.infer<
  typeof storeDescriptionMessageSchema
>;
export type StorePurchaseMessage = z.infer<typeof storePurchaseMessageSchema>;
export type StoreHistoryMessage = z.infer<typeof storeHistoryMessageSchema>;
export type StoreStateMessage = z.infer<typeof storeStateMessageSchema>;
export type StoreOffersMessage = z.infer<typeof storeOffersMessageSchema>;
export type StoreDescriptionStateMessage = z.infer<
  typeof storeDescriptionStateMessageSchema
>;
export type StoreHistoryEntry = z.infer<typeof storeHistoryEntrySchema>;
export type StoreHistoryStateMessage = z.infer<
  typeof storeHistoryStateMessageSchema
>;
export type StorePurchaseCompletedMessage = z.infer<
  typeof storePurchaseCompletedMessageSchema
>;
export type StoreActionFailedReason = z.infer<
  typeof storeActionFailedMessageSchema
>["reason"];
