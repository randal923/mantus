import type { DailyRewardKind } from "@tibia/protocol";

const ICONS: Record<DailyRewardKind, string> = {
  "vocation-items": "reward-pickitems.png",
  "training-items": "reward-pickitems.png",
  wildcards: "reward-fixeditems.png",
  "xp-boost": "reward-xpboost.png",
};

/**
 * The 64x64 icon a day shows. OTClient picks it from the reward's shape
 * (game_rewardwall.lua's checkRewards): days you choose items on get the
 * pick-items bag, fixed bundles get the crate, and day seven the XP arrow.
 */
export function getDailyRewardKindIcon(kind: DailyRewardKind): string {
  return `reward-wall/${ICONS[kind]}`;
}
