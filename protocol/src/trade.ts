import { z } from "zod";
import { inventoryItemSchema } from "./item";
import { PROTOCOL_LIMITS } from "./limits";

export const TRADE_LIMITS = {
  /** Chebyshev tile distance to the partner, same floor (Canary areInRange<2,2,0>). */
  maxPartnerDistance: 2,
  /** Offered root item plus every nested item (Canary's 100-item trade cap). */
  maxOfferedItems: 100,
  /** One trade mutation per second per session (Canary has no trade exhaust; project addition). */
  actionCooldownMs: 1_000,
  /** Idle trades cancel after this long (Canary has no timeout; project addition). */
  inactivityTimeoutMs: 120_000,
} as const;

/**
 * Trade intents are fixed-size and covered by the shared 4096-byte /
 * 30-per-second transport caps; request and accept are further limited to
 * one per second per session server-side. All outcomes (reservation,
 * validation, the swap itself) are computed server-side.
 */

/** Offers one carried item to a nearby player, opening or answering a trade. */
export const tradeRequestMessageSchema = z
  .object({
    type: z.literal("trade-request"),
    targetPlayerId: z.string().min(1).max(192),
    itemId: z.string().uuid(),
    revision: z.number().int().positive(),
  })
  .strict();

/** Accepts the current trade; the swap commits once both sides accepted. */
export const tradeAcceptMessageSchema = z
  .object({ type: z.literal("trade-accept") })
  .strict();

/** Cancels the current trade; every reserved item returns to its owner. */
export const tradeCancelMessageSchema = z
  .object({ type: z.literal("trade-cancel") })
  .strict();

/** One offered item; depth nests it below the offered root (0 = the root). */
export const tradeOfferEntrySchema = z
  .object({
    item: inventoryItemSchema,
    depth: z.number().int().min(0).max(7),
  })
  .strict();

const tradeOfferSchema = z
  .array(tradeOfferEntrySchema)
  .min(1)
  .max(TRADE_LIMITS.maxOfferedItems);

/**
 * Full visible state of the receiving player's own trade: both offers (each
 * a flat root-first list, mirroring Canary's trade windows) and both accept
 * flags. The partner is always a nearby, mutually visible player, so the
 * name and offer contents leak nothing beyond what trading already shows.
 */
export const tradeStateMessageSchema = z
  .object({
    type: z.literal("trade-state"),
    partnerId: z.string().min(1).max(192),
    partnerName: z
      .string()
      .min(1)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
    ownOffer: tradeOfferSchema.nullable(),
    partnerOffer: tradeOfferSchema.nullable(),
    ownAccepted: z.boolean(),
    partnerAccepted: z.boolean(),
  })
  .strict();

export const tradeClosedMessageSchema = z
  .object({
    type: z.literal("trade-closed"),
    reason: z.enum([
      "completed",
      "cancelled",
      "moved-away",
      "disconnected",
      "timeout",
      "no-capacity",
      "no-room",
      "failed",
    ]),
  })
  .strict();

export const tradeActionFailedMessageSchema = z
  .object({
    type: z.literal("trade-action-failed"),
    reason: z.enum([
      "busy",
      "cooldown",
      "unavailable",
      "not-possible",
      "too-far-away",
      "not-reachable",
      "already-trading",
      "partner-already-trading",
      "too-many-items",
      "not-ready",
      "failed",
    ]),
  })
  .strict();

export type TradeRequestMessage = z.infer<typeof tradeRequestMessageSchema>;
export type TradeAcceptMessage = z.infer<typeof tradeAcceptMessageSchema>;
export type TradeCancelMessage = z.infer<typeof tradeCancelMessageSchema>;
export type TradeOfferEntry = z.infer<typeof tradeOfferEntrySchema>;
export type TradeStateMessage = z.infer<typeof tradeStateMessageSchema>;
export type TradeClosedMessage = z.infer<typeof tradeClosedMessageSchema>;
export type TradeClosedReason = TradeClosedMessage["reason"];
export type TradeActionFailedMessage = z.infer<
  typeof tradeActionFailedMessageSchema
>;
export type TradeActionFailedReason = TradeActionFailedMessage["reason"];
