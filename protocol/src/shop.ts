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
const shopAmountSchema = z.number().int().min(1).max(100);

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
    minimumAmount: shopAmountSchema,
    maximumAmount: shopAmountSchema,
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
