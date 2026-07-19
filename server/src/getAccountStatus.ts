import { MAX_PREMIUM_DAYS, type AccountTier } from "@tibia/protocol";
import type { Account } from "./AccountStore";

const DAY_MS = 24 * 60 * 60 * 1_000;
export function getAccountStatus(
  account: Account,
  now: number,
): { readonly accountTier: AccountTier; readonly premiumDaysRemaining: number } {
  const premiumUntil = account.premiumUntil?.getTime() ?? 0;
  if (!Number.isFinite(premiumUntil) || premiumUntil <= now) {
    return { accountTier: "free", premiumDaysRemaining: 0 };
  }
  return {
    accountTier: "premium",
    premiumDaysRemaining: Math.min(
      MAX_PREMIUM_DAYS,
      Math.ceil((premiumUntil - now) / DAY_MS),
    ),
  };
}
