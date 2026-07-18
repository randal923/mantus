import { z } from "zod";
import { BANK_LIMITS } from "./bank";

export const MARKET_LIMITS = {
  /** Fee is 2% of the total price, clamped to [feeMinimum, feeMaximum]. */
  feeBasisPoints: 200,
  feeMinimum: 20,
  feeMaximum: 1_000_000,
  /** Per-unit price ceiling; the total cap below is the binding limit. */
  maxUnitPrice: 1_000_000_000_000,
  /** amount * unitPrice must stay within one bank transaction. */
  maxTotalPrice: BANK_LIMITS.maxTransactionAmount,
  maxAmountStackable: 64_000,
  maxAmountNonStackable: 2_000,
  maxActiveOffersPerCharacter: 100,
  maxEscrowItemsPerCharacter: 2_000,
  offerDurationDays: 30,
  /** One market mutation per second per session, matching Canary's exhaust. */
  actionCooldownMs: 1_000,
  itemPageSize: 100,
  maxItemPages: 64,
  maxOffersPerSide: 100,
  maxOwnOffers: 100,
  maxHistoryEntries: 50,
} as const;

export const MARKET_CATEGORIES = [
  "weapons",
  "armor",
  "shields",
  "spellbooks",
  "consumables",
  "runes",
  "valuables",
] as const;

const marketRequestIdSchema = z.string().uuid();
const marketOfferIdSchema = z.string().uuid();
const marketSideSchema = z.enum(["buy", "sell"]);
const itemTypeIdSchema = z.number().int().min(1).max(65_535);
const marketAmountSchema = z
  .number()
  .int()
  .min(1)
  .max(MARKET_LIMITS.maxAmountStackable);
const marketUnitPriceSchema = z
  .number()
  .int()
  .min(1)
  .max(MARKET_LIMITS.maxUnitPrice);
const marketTotalSchema = z
  .number()
  .int()
  .min(0)
  .max(MARKET_LIMITS.maxTotalPrice);
const marketBalanceSchema = z.number().int().min(0).max(BANK_LIMITS.maxBalance);

/**
 * Market intents are usable anywhere while in-game (project deviation from
 * Canary's depot-proximity rule); each is fixed-size under the shared
 * 4096-byte/30-per-second transport caps, and mutations are further limited
 * to one per second per session server-side.
 */

export const marketOpenMessageSchema = z
  .object({
    type: z.literal("market-open"),
    page: z.number().int().min(1).max(MARKET_LIMITS.maxItemPages),
  })
  .strict();

export const marketBrowseMessageSchema = z
  .object({
    type: z.literal("market-browse"),
    itemTypeId: itemTypeIdSchema,
  })
  .strict();

/** Creates one offer; items/funds escrow server-side at execution time. */
export const marketCreateOfferMessageSchema = z
  .object({
    type: z.literal("market-create-offer"),
    requestId: marketRequestIdSchema,
    side: marketSideSchema,
    itemTypeId: itemTypeIdSchema,
    amount: marketAmountSchema,
    unitPrice: marketUnitPriceSchema,
  })
  .strict();

/** Accepts (part of) one offer; every leg re-validates inside one transaction. */
export const marketAcceptOfferMessageSchema = z
  .object({
    type: z.literal("market-accept-offer"),
    requestId: marketRequestIdSchema,
    offerId: marketOfferIdSchema,
    amount: marketAmountSchema,
  })
  .strict();

export const marketCancelOfferMessageSchema = z
  .object({
    type: z.literal("market-cancel-offer"),
    requestId: marketRequestIdSchema,
    offerId: marketOfferIdSchema,
  })
  .strict();

export const marketOwnOffersMessageSchema = z
  .object({
    type: z.literal("market-own-offers"),
  })
  .strict();

export const marketOwnHistoryMessageSchema = z
  .object({
    type: z.literal("market-own-history"),
  })
  .strict();

export const marketCategorySchema = z.enum(MARKET_CATEGORIES);

export const marketItemEntrySchema = z
  .object({
    itemTypeId: itemTypeIdSchema,
    clientId: itemTypeIdSchema,
    spriteId: z.number().int().positive(),
    name: z.string().min(1).max(120),
    category: marketCategorySchema,
    stackable: z.boolean(),
    /** Pristine, sellable stock in the opened depot; never anyone else's. */
    ownedCount: z.number().int().min(0).max(200_000),
    /** Average accepted unit price from market history; 0 when unknown. */
    averagePrice: z.number().int().min(0).max(MARKET_LIMITS.maxUnitPrice),
  })
  .strict();

export const marketOpenedMessageSchema = z
  .object({
    type: z.literal("market-opened"),
    balance: marketBalanceSchema,
    activeOfferCount: z
      .number()
      .int()
      .min(0)
      .max(MARKET_LIMITS.maxActiveOffersPerCharacter),
    page: z.number().int().min(1).max(MARKET_LIMITS.maxItemPages),
    pageCount: z.number().int().min(1).max(MARKET_LIMITS.maxItemPages),
    items: z.array(marketItemEntrySchema).max(MARKET_LIMITS.itemPageSize),
  })
  .strict();

export const marketOfferEntrySchema = z
  .object({
    offerId: marketOfferIdSchema,
    side: marketSideSchema,
    /** Remaining amount still open on the offer. */
    amount: marketAmountSchema,
    unitPrice: marketUnitPriceSchema,
    expiresAt: z.string().datetime(),
    /** True only for the receiving character's own offers; no names leak. */
    mine: z.boolean(),
  })
  .strict();

export const marketOffersMessageSchema = z
  .object({
    type: z.literal("market-offers"),
    itemTypeId: itemTypeIdSchema,
    offers: z
      .array(marketOfferEntrySchema)
      .max(2 * MARKET_LIMITS.maxOffersPerSide),
  })
  .strict();

export const marketOwnOfferEntrySchema = z
  .object({
    offerId: marketOfferIdSchema,
    side: marketSideSchema,
    itemTypeId: itemTypeIdSchema,
    spriteId: z.number().int().positive(),
    name: z.string().min(1).max(120),
    amount: marketAmountSchema,
    unitPrice: marketUnitPriceSchema,
    expiresAt: z.string().datetime(),
  })
  .strict();

export const marketOwnOffersStateMessageSchema = z
  .object({
    type: z.literal("market-own-offers-state"),
    offers: z.array(marketOwnOfferEntrySchema).max(MARKET_LIMITS.maxOwnOffers),
  })
  .strict();

export const marketHistoryEntrySchema = z
  .object({
    side: marketSideSchema,
    itemTypeId: itemTypeIdSchema,
    spriteId: z.number().int().positive(),
    name: z.string().min(1).max(120),
    amount: marketAmountSchema,
    unitPrice: marketUnitPriceSchema,
    state: z.enum(["accepted", "cancelled", "expired"]),
    occurredAt: z.string().datetime(),
  })
  .strict();

export const marketOwnHistoryStateMessageSchema = z
  .object({
    type: z.literal("market-own-history-state"),
    entries: z
      .array(marketHistoryEntrySchema)
      .max(MARKET_LIMITS.maxHistoryEntries),
  })
  .strict();

export const marketTransactedMessageSchema = z
  .object({
    type: z.literal("market-transacted"),
    requestId: marketRequestIdSchema,
    kind: z.enum(["created", "accepted", "cancelled"]),
    offerId: marketOfferIdSchema,
    side: marketSideSchema,
    itemTypeId: itemTypeIdSchema,
    amount: marketAmountSchema,
    totalPrice: marketTotalSchema,
    fee: z.number().int().min(0).max(MARKET_LIMITS.feeMaximum),
    balance: marketBalanceSchema,
  })
  .strict();

export const marketActionFailedMessageSchema = z
  .object({
    type: z.literal("market-action-failed"),
    reason: z.enum([
      "busy",
      "cooldown",
      "unavailable",
      "invalid-item",
      "not-marketable",
      "not-owned",
      "own-offer",
      "offer-not-found",
      "insufficient-funds",
      "insufficient-items",
      "offer-limit",
      "escrow-full",
      "inbox-full",
      "amount-too-large",
      "price-limit",
      "duplicate-request",
      "balance-limit",
      "failed",
    ]),
  })
  .strict();

export type MarketCategory = z.infer<typeof marketCategorySchema>;
export type MarketSide = z.infer<typeof marketSideSchema>;
export type MarketOpenMessage = z.infer<typeof marketOpenMessageSchema>;
export type MarketBrowseMessage = z.infer<typeof marketBrowseMessageSchema>;
export type MarketCreateOfferMessage = z.infer<
  typeof marketCreateOfferMessageSchema
>;
export type MarketAcceptOfferMessage = z.infer<
  typeof marketAcceptOfferMessageSchema
>;
export type MarketCancelOfferMessage = z.infer<
  typeof marketCancelOfferMessageSchema
>;
export type MarketOwnOffersMessage = z.infer<
  typeof marketOwnOffersMessageSchema
>;
export type MarketOwnHistoryMessage = z.infer<
  typeof marketOwnHistoryMessageSchema
>;
export type MarketItemEntry = z.infer<typeof marketItemEntrySchema>;
export type MarketOpenedMessage = z.infer<typeof marketOpenedMessageSchema>;
export type MarketOfferEntry = z.infer<typeof marketOfferEntrySchema>;
export type MarketOffersMessage = z.infer<typeof marketOffersMessageSchema>;
export type MarketOwnOfferEntry = z.infer<typeof marketOwnOfferEntrySchema>;
export type MarketOwnOffersStateMessage = z.infer<
  typeof marketOwnOffersStateMessageSchema
>;
export type MarketHistoryEntry = z.infer<typeof marketHistoryEntrySchema>;
export type MarketOwnHistoryStateMessage = z.infer<
  typeof marketOwnHistoryStateMessageSchema
>;
export type MarketTransactedMessage = z.infer<
  typeof marketTransactedMessageSchema
>;
export type MarketActionFailedMessage = z.infer<
  typeof marketActionFailedMessageSchema
>;
export type MarketActionFailedReason = MarketActionFailedMessage["reason"];
