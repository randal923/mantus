import { BANK_LIMITS } from "@tibia/protocol";

const DIGITS = /\d+/u;

/**
 * Reads the amount out of a free-text money line ("deposit 500"). The text is
 * whatever the player typed, so this returns null for anything that is not a
 * plain in-range integer — no separators, no signs, no exponents. The server
 * still re-validates the amount at execution time; this only decides whether
 * the branch has an amount at all.
 */
export function parseBankKeywordAmount(input: string): number | null {
  const matched = DIGITS.exec(input);
  if (!matched) return null;
  // A line long enough to overflow the balance cap is rejected before parse.
  if (matched[0].length > String(BANK_LIMITS.maxBalance).length) return null;
  const amount = Number(matched[0]);
  if (!Number.isSafeInteger(amount) || amount < 1) return null;
  return amount > BANK_LIMITS.maxBalance ? null : amount;
}
