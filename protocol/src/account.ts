import { z } from "zod";

export const ACCOUNT_TIERS = ["free", "premium"] as const;
export const MAX_PREMIUM_DAYS = 100_000;

export const accountTierSchema = z.enum(ACCOUNT_TIERS);

export const premiumDaysRemainingSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_PREMIUM_DAYS);

export type AccountTier = z.infer<typeof accountTierSchema>;
