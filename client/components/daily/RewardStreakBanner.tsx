"use client";

import { getRewardStreakTier } from "../../lib/daily/getRewardStreakTier";
import { PixelImage } from "../ui/PixelImage";

interface RewardStreakBannerProps {
  streakLevel: number;
  label: string;
  size?: "default" | "large";
}

/**
 * The streak ribbon, with the consecutive-day count written across it. The
 * banner art changes tier as the streak grows (see `getRewardStreakTier`).
 */
export function RewardStreakBanner({
  streakLevel,
  label,
  size = "default",
}: RewardStreakBannerProps) {
  const large = size === "large";

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
        scale={large ? 3 : 1}
      />
      <span
        aria-hidden
        className={`absolute inset-x-0 text-center font-display font-bold text-ui-text-bright [text-shadow:0_1px_2px_rgba(0,0,0,0.95)] ${
          large ? "top-10 text-3xl" : "top-3.5 text-xs"
        }`}
      >
        {streakLevel}
      </span>
    </div>
  );
}
