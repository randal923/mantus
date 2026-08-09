import { z } from "zod";

/**
 * The Portable Seller: a store-bought device that vendors the contents of
 * the owner's loot pouch. The server owns every rule — these constants exist
 * so the client can label the item and its cooldowns without inventing
 * numbers, and so both sides agree on the type id.
 */
export const PORTABLE_SELLER_TYPE_ID = 60_109;

/** How often the seller fires on its own while carried. */
export const PORTABLE_SELLER_AUTO_INTERVAL_MS = 10 * 60_000;

/** Minimum wait between manual right-click triggers. */
export const PORTABLE_SELLER_MANUAL_COOLDOWN_MS = 60_000;

/**
 * One completed sale sweep. Sent only to the owner, and only when at least
 * one item sold; the client uses it to play the sale animation and log the
 * proceeds. `saleId` grows per session so repeat sales re-fire the animation.
 */
export const portableSellerTriggeredMessageSchema = z
  .object({
    type: z.literal("portable-seller-triggered"),
    saleId: z.number().int().positive(),
    itemId: z.string().uuid(),
    soldCount: z.number().int().positive(),
    proceeds: z.number().int().positive(),
    bankBalance: z.number().int().nonnegative(),
  })
  .strict();

export type PortableSellerTriggeredMessage = z.infer<
  typeof portableSellerTriggeredMessageSchema
>;

/**
 * A manual trigger refused because the seller is still recharging. Carries
 * the server's own remaining wait so the client can show a countdown without
 * ever keeping its own authoritative clock.
 */
export const portableSellerCooldownMessageSchema = z
  .object({
    type: z.literal("portable-seller-cooldown"),
    remainingMs: z
      .number()
      .int()
      .positive()
      .max(PORTABLE_SELLER_MANUAL_COOLDOWN_MS),
  })
  .strict();

export type PortableSellerCooldownMessage = z.infer<
  typeof portableSellerCooldownMessageSchema
>;
