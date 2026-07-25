import { z } from "zod";

export const STORE_LIMITS = {
  maxBalance: 1_000_000_000_000,
  maxCategories: 12,
  maxOffersPerCategory: 24,
  actionCooldownMs: 500,
  /** Coin-history page size; the server never returns more than this. */
  maxHistoryEntries: 50,
} as const;

const mantusCoinBalanceSchema = z
  .number()
  .int()
  .min(0)
  .max(STORE_LIMITS.maxBalance);

export const storeOpenMessageSchema = z
  .object({
    type: z.literal("store-open"),
  })
  .strict();

export const storePurchaseMessageSchema = z
  .object({
    type: z.literal("store-purchase"),
    offerId: z.string().min(1).max(64),
  })
  .strict();

/** An offer grants premium time or an item; never both, never neither. */
export const storeOfferSchema = z
  .object({
    id: z.string().min(1).max(64),
    price: z.number().int().positive().max(STORE_LIMITS.maxBalance),
    premiumDays: z.number().int().positive().max(365).optional(),
    item: z
      .object({
        itemTypeId: z.number().int().min(1).max(65_535),
        count: z.number().int().min(1).max(100),
      })
      .strict()
      .optional(),
    featured: z.boolean().optional(),
  })
  .strict()
  .refine(
    (offer) => (offer.premiumDays === undefined) !== (offer.item === undefined),
    { message: "a store offer grants exactly one product" },
  );

export const storeCategorySchema = z
  .object({
    id: z.string().min(1).max(64),
    offers: z.array(storeOfferSchema).max(STORE_LIMITS.maxOffersPerCategory),
  })
  .strict();

export const storeStateMessageSchema = z
  .object({
    type: z.literal("store-state"),
    balance: mantusCoinBalanceSchema,
    categories: z.array(storeCategorySchema).max(STORE_LIMITS.maxCategories),
  })
  .strict();

export const storePurchaseCompletedMessageSchema = z
  .object({
    type: z.literal("store-purchase-completed"),
    offerId: z.string().min(1).max(64),
    balance: mantusCoinBalanceSchema,
    accountTier: z.enum(["free", "premium"]),
    premiumDaysRemaining: z.number().int().min(0).max(100_000),
    /** True when the product was delivered to the buyer's inbox. */
    deliveredToInbox: z.boolean().optional(),
  })
  .strict();

export const storeHistoryMessageSchema = z
  .object({
    type: z.literal("store-history"),
  })
  .strict();

export const storeHistoryEntrySchema = z
  .object({
    id: z.string().min(1).max(32),
    entryType: z.enum(["grant", "purchase", "refund"]),
    /** Signed: negative spends, positive credits. */
    amount: z.number().int().min(-STORE_LIMITS.maxBalance).max(STORE_LIMITS.maxBalance),
    balanceAfter: mantusCoinBalanceSchema,
    offerId: z.string().min(1).max(64).nullable(),
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
      "premium-limit",
      "inbox-full",
      "rate-limited",
      "unavailable",
      "failed",
    ]),
  })
  .strict();

export type StoreOpenMessage = z.infer<typeof storeOpenMessageSchema>;
export type StorePurchaseMessage = z.infer<typeof storePurchaseMessageSchema>;
export type StoreHistoryMessage = z.infer<typeof storeHistoryMessageSchema>;
export type StoreOffer = z.infer<typeof storeOfferSchema>;
export type StoreCategory = z.infer<typeof storeCategorySchema>;
export type StoreStateMessage = z.infer<typeof storeStateMessageSchema>;
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
