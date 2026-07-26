import type { DailyStreakRecord } from "./assessDailyStreak";

/**
 * Advances a settled record for today's claim (Canary daily_reward.lua
 * :255-274): the paid reward day is the current position+1, the position
 * cycles 0..6, the streak level grows without bound.
 */
export function claimDailyStreak(
  settled: DailyStreakRecord,
  todayKey: string,
): { rewardDay: number; next: DailyStreakRecord } {
  return {
    rewardDay: settled.streakPosition + 1,
    next: {
      streakPosition: (settled.streakPosition + 1) % 7,
      streakLevel: settled.streakLevel + 1,
      jokerTokens: settled.jokerTokens,
      lastClaimDay: todayKey,
      lastJokerMonth: settled.lastJokerMonth,
    },
  };
}
