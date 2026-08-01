export type DailyRewardDayState =
  | "collected"
  | "current"
  | "next"
  | "locked";

/**
 * How one of the seven days draws (OTClient game_rewardwall.lua's
 * updateDailyRewards): every day before the cycle position is already
 * collected, the position itself is either claimable now or the next reward
 * waiting for the server-local day boundary, and the rest stay locked.
 */
export function getDailyRewardDayState(
  dayIndex: number,
  streakPosition: number,
  claimableToday: boolean,
): DailyRewardDayState {
  if (dayIndex < streakPosition) return "collected";
  if (dayIndex > streakPosition) return "locked";
  return claimableToday ? "current" : "next";
}
