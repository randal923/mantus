import { z } from "zod";

export const STORE_LIMITS = {
  maxBalance: 1_000_000_000_000,
  maxCategories: 12,
  maxOffersPerCategory: 24,
  actionCooldownMs: 500,
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

export const storeOfferSchema = z
  .object({
    id: z.string().min(1).max(64),
    price: z.number().int().positive().max(STORE_LIMITS.maxBalance),
    premiumDays: z.number().int().positive().max(365),
    featured: z.boolean().optional(),
  })
  .strict();

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
    accountTier: z.literal("premium"),
    premiumDaysRemaining: z.number().int().positive().max(100_000),
  })
  .strict();

export const storeActionFailedMessageSchema = z
  .object({
    type: z.literal("store-action-failed"),
    reason: z.enum([
      "insufficient-coins",
      "offer-not-found",
      "premium-limit",
      "rate-limited",
      "unavailable",
      "failed",
    ]),
  })
  .strict();

export type StoreOpenMessage = z.infer<typeof storeOpenMessageSchema>;
export type StorePurchaseMessage = z.infer<typeof storePurchaseMessageSchema>;
export type StoreOffer = z.infer<typeof storeOfferSchema>;
export type StoreCategory = z.infer<typeof storeCategorySchema>;
export type StoreStateMessage = z.infer<typeof storeStateMessageSchema>;
export type StorePurchaseCompletedMessage = z.infer<
  typeof storePurchaseCompletedMessageSchema
>;
export type StoreActionFailedReason = z.infer<
  typeof storeActionFailedMessageSchema
>["reason"];
