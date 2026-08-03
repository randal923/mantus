export type DailyRewardDayState =
  | "collected"
  | "current"
  | "next"
  | "locked";

/**
 * How one of the seven days draws (OTClient game_rewardwall.lua's
 * updateDailyRewards): every day before the cycle position is already
 * collected, and the position itself is the day this cycle still owes — either
 * claimable right now, which is the card that takes the click, or, once
 * today's claim is in, the reward waiting on the server-local day boundary.
 * The countdown belongs to that waiting day, so while today is claimable it
 * sits on the day after it rather than on the reward already unlocked.
 */
export function getDailyRewardDayState(
  dayIndex: number,
  streakPosition: number,
  claimableToday: boolean,
): DailyRewardDayState {
  if (dayIndex < streakPosition) return "collected";
  if (dayIndex === streakPosition) return claimableToday ? "current" : "next";
  if (claimableToday && dayIndex === streakPosition + 1) return "next";
  return "locked";
}
