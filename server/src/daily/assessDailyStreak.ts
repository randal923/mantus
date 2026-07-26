export interface DailyStreakRecord {
  /** 0..6 cycle position; the next claim pays day position+1. */
  readonly streakPosition: number;
  readonly streakLevel: number;
  readonly jokerTokens: number;
  /** Server-local YYYY-MM-DD of the last claim, null before the first. */
  readonly lastClaimDay: string | null;
  /** YYYY-MM of the last monthly joker grant. */
  readonly lastJokerMonth: string | null;
}

export interface DailyStreakAssessment {
  readonly claimable: boolean;
  readonly missedDays: number;
  readonly jokersSpent: number;
  readonly streakLevelLost: boolean;
  /** Record after joker/miss settlement, before any claim advance. */
  readonly settled: DailyStreakRecord;
}

const DAY_MS = 86_400_000;
const MAX_JOKER_TOKENS = 3;

function dayDifference(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

/**
 * Canary daily_reward.lua:295-334 folded into the claim path: the monthly
 * joker grant (+1 per calendar month while under 3), then missed days —
 * jokers absorb them one-for-one, otherwise the streak LEVEL resets to zero
 * while the 0..6 cycle position keeps cycling (a pinned Canary quirk).
 * Pure and non-mutating so projections and the claim transaction share it.
 */
export function assessDailyStreak(
  record: DailyStreakRecord,
  todayKey: string,
): DailyStreakAssessment {
  const month = todayKey.slice(0, 7);
  let jokerTokens = record.jokerTokens;
  let lastJokerMonth = record.lastJokerMonth;
  if (lastJokerMonth !== month && jokerTokens < MAX_JOKER_TOKENS) {
    jokerTokens += 1;
    lastJokerMonth = month;
  }
  let streakLevel = record.streakLevel;
  let missedDays = 0;
  let jokersSpent = 0;
  let streakLevelLost = false;
  if (record.lastClaimDay !== null) {
    const gap = dayDifference(record.lastClaimDay, todayKey);
    if (gap <= 0) {
      return {
        claimable: false,
        missedDays: 0,
        jokersSpent: 0,
        streakLevelLost: false,
        settled: { ...record, jokerTokens, lastJokerMonth },
      };
    }
    missedDays = gap - 1;
    if (missedDays > 0) {
      if (jokerTokens >= missedDays) {
        jokerTokens -= missedDays;
        jokersSpent = missedDays;
      } else {
        streakLevel = 0;
        jokerTokens = 0;
        streakLevelLost = true;
      }
    }
  }
  return {
    claimable: true,
    missedDays,
    jokersSpent,
    streakLevelLost,
    settled: {
      ...record,
      streakLevel,
      jokerTokens,
      lastJokerMonth,
    },
  };
}
