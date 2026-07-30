export type RewardStreakTier = "default" | "bronze" | "silver" | "gold";

/**
 * Banner art for a streak level (OTClient game_rewardwall.lua:219-222):
 * default up to 24 days, then bronze, silver, and gold from 100 on.
 */
export function getRewardStreakTier(streakLevel: number): RewardStreakTier {
  if (streakLevel <= 24) return "default";
  if (streakLevel <= 49) return "bronze";
  if (streakLevel <= 99) return "silver";
  return "gold";
}
