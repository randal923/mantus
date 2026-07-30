import { z } from "zod";

const npcReferenceSchema = z.string().min(1).max(192);
const shopReferenceSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const shopSessionReferenceSchema = z.string().uuid();
const itemTypeIdSchema = z.number().int().min(1).max(65_535);
const shopPriceSchema = z.number().int().min(0).max(1_000_000_000);
export const SHOP_LIMITS = {
  /**
   * Largest amount one intent may trade. Canary caps a non-stackable buy at
   * 100 and OTClient's amount slider caps every buy at 100.
   */
  maxAmount: 100,
  /**
   * Canary applies a 250 ms UI exhaust per shop action (`isUIExhausted`).
   * The server owns the real timer; the client mirrors it only to hold a click
   * back instead of sending one it knows will be refused.
   */
  exhaustMs: 250,
} as const;

const shopAmountSchema = z.number().int().min(1).max(SHOP_LIMITS.maxAmount);

/**
 * Buys one catalog entry; price, stock, and funds stay server-owned. This is a
 * fixed-size intent under the shared transport rate cap, and the server allows
 * only one pending item operation for the session.
 */
export const shopBuyMessageSchema = z
  .object({
    type: z.literal("shop-buy"),
    npcId: npcReferenceSchema,
    shopSessionId: shopSessionReferenceSchema,
    offerId: shopReferenceSchema,
    amount: shopAmountSchema,
  })
  .strict();

/**
 * Sells owned items to the shop; ownership is re-checked at execution. It has
 * the same fixed-size and shared-rate expectations as the buy intent.
 */
export const shopSellMessageSchema = z
  .object({
    type: z.literal("shop-sell"),
    npcId: npcReferenceSchema,
    shopSessionId: shopSessionReferenceSchema,
    offerId: shopReferenceSchema,
    amount: shopAmountSchema,
  })
  .strict();

export const shopEntrySchema = z
  .object({
    offerId: shopReferenceSchema,
    itemTypeId: itemTypeIdSchema,
    clientId: itemTypeIdSchema,
    spriteId: z.number().int().positive(),
    name: z.string().min(1).max(120),
    stackable: z.boolean(),
    maxCount: z.number().int().min(1).max(100),
    weight: z.number().int().nonnegative(),
    stowable: z.boolean().optional(),
    minimumAmount: shopAmountSchema,
    maximumAmount: shopAmountSchema,
    /**
     * How many of this offer the player can sell right now — their own data,
     * counted server-side because nested bags are not fully projected to the
     * client. Canary ships the same per-offer counts with its sale list.
     */
    owned: z.number().int().nonnegative().max(1_000_000),
    subtype: z.number().int().min(1).max(65_535).optional(),
    buyPrice: shopPriceSchema.optional(),
    sellPrice: shopPriceSchema.optional(),
  })
  .strict();

export const shopOpenedMessageSchema = z
  .object({
    type: z.literal("shop-opened"),
    npcId: npcReferenceSchema,
    npcName: z.string().min(1).max(100),
    shopId: shopReferenceSchema,
    shopSessionId: shopSessionReferenceSchema,
    currencyItemTypeId: itemTypeIdSchema,
    currencySpriteId: z.number().int().positive(),
    currencyName: z.string().min(1).max(120),
    currencyAmount: z.number().int().min(0).max(100_000_000_000),
    /** Unit weight of the shop's currency item, hundredths of oz. */
    currencyWeight: z.number().int().nonnegative(),
    /**
     * The buyer's own bank balance. A gold shop spends carried coins first and
     * the shortfall from the bank, so the amount slider needs both to clamp to
     * what the player can actually afford (Canary sends the same sum).
     */
    bankBalance: z.number().int().min(0).max(1_000_000_000_000_000),
    /** Coin unit weights so the client can mirror payment-weight math. */
    coinWeights: z
      .object({
        gold: z.number().int().nonnegative(),
        platinum: z.number().int().nonnegative(),
        crystal: z.number().int().nonnegative(),
      })
      .strict(),
    page: z.number().int().min(1).max(256),
    pageCount: z.number().int().min(1).max(256),
    entries: z.array(shopEntrySchema).max(256),
  })
  .strict();

export const shopTransactedMessageSchema = z
  .object({
    type: z.literal("shop-transacted"),
    kind: z.enum(["purchase", "sale"]),
    offerId: shopReferenceSchema,
    itemTypeId: itemTypeIdSchema,
    name: z.string().min(1).max(120),
    amount: z.number().int().min(1).max(100),
    totalPrice: z.number().int().min(0).max(100_000_000_000),
    /**
     * Sale proceeds that did not fit in the backpack and were credited to the
     * seller's own bank instead. Their own data only.
     */
    bankCredited: z.number().int().min(0).max(100_000_000_000).optional(),
  })
  .strict();

export const shopActionFailedMessageSchema = z
  .object({
    type: z.literal("shop-action-failed"),
    reason: z.enum([
      "out-of-range",
      "busy",
      "unavailable",
      "invalid-item",
      "out-of-stock",
      "insufficient-funds",
      "not-owned",
      "no-space",
      "no-capacity",
      "failed",
    ]),
  })
  .strict();

export type ShopBuyMessage = z.infer<typeof shopBuyMessageSchema>;
export type ShopSellMessage = z.infer<typeof shopSellMessageSchema>;
export type ShopEntryProjection = z.infer<typeof shopEntrySchema>;
export type ShopOpenedMessage = z.infer<typeof shopOpenedMessageSchema>;
export type ShopTransactedMessage = z.infer<typeof shopTransactedMessageSchema>;
export type ShopActionFailedMessage = z.infer<
  typeof shopActionFailedMessageSchema
>;
export type ShopActionFailedReason = ShopActionFailedMessage["reason"];
