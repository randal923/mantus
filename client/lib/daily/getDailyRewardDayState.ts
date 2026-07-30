export type DailyRewardDayState = "collected" | "current" | "locked";

/**
 * How one of the seven days draws (OTClient game_rewardwall.lua's
 * updateDailyRewards): every day before the cycle position is already
 * collected, the position itself is today's claim, and the rest stay locked
 * until their turn comes. Once today is claimed the current day joins the
 * collected run, which is what turns the whole row into checkmarks.
 */
export function getDailyRewardDayState(
  dayIndex: number,
  streakPosition: number,
  claimableToday: boolean,
): DailyRewardDayState {
  if (dayIndex < streakPosition) return "collected";
  if (dayIndex > streakPosition) return "locked";
  return claimableToday ? "current" : "collected";
}
