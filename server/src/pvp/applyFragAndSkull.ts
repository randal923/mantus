import type { PvpPolicy } from "./PvpPolicy";

export interface FragSkullOutcome {
  readonly skull: "none" | "red" | "black";
  readonly expiresAtMs: number | null;
}

/**
 * Pure frag-window sanction: counts unjustified frags inside the Canary
 * day/week/month windows and returns the resulting persistent skull. The
 * expiry is anchored at `now` (the qualifying kill's execution instant).
 */
export function applyFragAndSkull(
  policy: PvpPolicy,
  unjustifiedFragTimesMs: ReadonlyArray<number>,
  now: number,
): FragSkullOutcome {
  let day = 0;
  let week = 0;
  let month = 0;
  for (const occurredAt of unjustifiedFragTimesMs) {
    const age = now - occurredAt;
    if (age < 0 || age > policy.fragWindowMonthMs) continue;
    month++;
    if (age <= policy.fragWindowWeekMs) week++;
    if (age <= policy.fragWindowDayMs) day++;
  }
  if (
    day >= policy.dayKillsToBlack ||
    week >= policy.weekKillsToBlack ||
    month >= policy.monthKillsToBlack
  ) {
    return { skull: "black", expiresAtMs: now + policy.blackSkullDurationMs };
  }
  if (
    day >= policy.dayKillsToRed ||
    week >= policy.weekKillsToRed ||
    month >= policy.monthKillsToRed
  ) {
    return { skull: "red", expiresAtMs: now + policy.redSkullDurationMs };
  }
  return { skull: "none", expiresAtMs: null };
}
