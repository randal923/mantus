"use client";

import { getRewardStreakTier } from "../../lib/daily/getRewardStreakTier";
import { PixelImage } from "../ui/PixelImage";

interface RewardStreakBannerProps {
  streakLevel: number;
  label: string;
}

/**
 * The streak ribbon, with the consecutive-day count written across it. The
 * banner art changes tier as the streak grows (see `getRewardStreakTier`).
 */
export function RewardStreakBanner({
  streakLevel,
  label,
}: RewardStreakBannerProps) {
  return (
    <div
      className="relative flex items-center justify-center"
      aria-label={label}
      role="img"
    >
      <PixelImage
        src={`reward-wall/streak-${getRewardStreakTier(streakLevel)}.png`}
        sheetWidth={66}
        sheetHeight={44}
      />
      <span
        aria-hidden
        className="absolute inset-x-0 top-3.5 text-center font-display text-xs font-bold text-ui-text-bright [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]"
      >
        {streakLevel}
      </span>
    </div>
  );
}
