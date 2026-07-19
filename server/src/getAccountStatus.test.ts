import { describe, expect, it } from "vitest";
import type { Account } from "./AccountStore";
import { getAccountStatus } from "./getAccountStatus";

const account = (premiumUntil: Date | null): Account => ({
  id: "account-id",
  supabaseUserId: "user-id",
  email: null,
  bannedUntil: null,
  premiumUntil,
  language: "en",
  uiSettings: {},
});

describe("getAccountStatus", () => {
  it("treats new and expired accounts as free", () => {
    expect(getAccountStatus(account(null), 1_000)).toEqual({
      accountTier: "free",
      premiumDaysRemaining: 0,
    });
    expect(getAccountStatus(account(new Date(1_000)), 1_000)).toEqual({
      accountTier: "free",
      premiumDaysRemaining: 0,
    });
  });

  it("rounds active premium time up to the displayed day", () => {
    expect(getAccountStatus(account(new Date(1_001)), 1_000)).toEqual({
      accountTier: "premium",
      premiumDaysRemaining: 1,
    });
    expect(
      getAccountStatus(account(new Date(24 * 60 * 60 * 1_000 + 1_001)), 1_000),
    ).toEqual({
      accountTier: "premium",
      premiumDaysRemaining: 2,
    });
  });
});
