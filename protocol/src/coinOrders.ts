import { z } from "zod";
import { STORE_LIMITS } from "./store";

export const COIN_ORDER_LIMITS = {
  maxPackages: 8,
  /** Matches the `pix_orders.brcode` column cap; EMV BR Codes are ~300 chars. */
  maxBrcodeLength: 2_048,
  actionCooldownMs: 1_000,
  maxCoinsPerPackage: 1_000_000,
  maxAmountCentavos: 10_000_000,
} as const;

const packageIdSchema = z.string().min(1).max(64);
const orderIdSchema = z.string().uuid();
const coinAmountSchema = z
  .number()
  .int()
  .min(1)
  .max(COIN_ORDER_LIMITS.maxCoinsPerPackage);
const centavosSchema = z
  .number()
  .int()
  .min(1)
  .max(COIN_ORDER_LIMITS.maxAmountCentavos);

export const coinPackageSchema = z
  .object({
    id: packageIdSchema,
    coins: coinAmountSchema,
    amountCentavos: centavosSchema,
  })
  .strict();

export const coinOrderSchema = z
  .object({
    id: orderIdSchema,
    packageId: packageIdSchema,
    coins: coinAmountSchema,
    amountCentavos: centavosSchema,
    brcode: z.string().min(1).max(COIN_ORDER_LIMITS.maxBrcodeLength),
    expiresAt: z.string().datetime(),
  })
  .strict();

export const coinOrderOpenMessageSchema = z
  .object({
    type: z.literal("coin-order-open"),
  })
  .strict();

export const coinOrderCreateMessageSchema = z
  .object({
    type: z.literal("coin-order-create"),
    packageId: packageIdSchema,
  })
  .strict();

export const coinOrderCancelMessageSchema = z
  .object({
    type: z.literal("coin-order-cancel"),
    orderId: orderIdSchema,
  })
  .strict();

export const coinOrderStateMessageSchema = z
  .object({
    type: z.literal("coin-order-state"),
    packages: z.array(coinPackageSchema).max(COIN_ORDER_LIMITS.maxPackages),
    order: coinOrderSchema.nullable(),
  })
  .strict();

export const coinOrderCompletedMessageSchema = z
  .object({
    type: z.literal("coin-order-completed"),
    orderId: orderIdSchema,
    coins: coinAmountSchema,
    balance: z.number().int().min(0).max(STORE_LIMITS.maxBalance),
  })
  .strict();

export const coinOrderFailedMessageSchema = z
  .object({
    type: z.literal("coin-order-failed"),
    reason: z.enum([
      "pending-order-exists",
      "package-not-found",
      "order-not-found",
      "cancel-failed",
      "rate-limited",
      "unavailable",
      "failed",
    ]),
  })
  .strict();

export type CoinPackage = z.infer<typeof coinPackageSchema>;
export type CoinOrder = z.infer<typeof coinOrderSchema>;
export type CoinOrderOpenMessage = z.infer<typeof coinOrderOpenMessageSchema>;
export type CoinOrderCreateMessage = z.infer<
  typeof coinOrderCreateMessageSchema
>;
export type CoinOrderCancelMessage = z.infer<
  typeof coinOrderCancelMessageSchema
>;
export type CoinOrderStateMessage = z.infer<typeof coinOrderStateMessageSchema>;
export type CoinOrderCompletedMessage = z.infer<
  typeof coinOrderCompletedMessageSchema
>;
export type CoinOrderFailedMessage = z.infer<
  typeof coinOrderFailedMessageSchema
>;
export type CoinOrderFailedReason = z.infer<
  typeof coinOrderFailedMessageSchema
>["reason"];
