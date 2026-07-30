"use client";

import { PixelImage } from "../ui/PixelImage";

interface RestingBonusShieldProps {
  /** 1-6, matching the imported shield art and the six bonus thresholds. */
  index: number;
  active: boolean;
  /** Names the bonus and says whether it is running; also the hover text. */
  description: string;
}

/**
 * One resting-area bonus shield. Locked bonuses draw the same art dimmed and
 * desaturated rather than a second sprite, which is how OTClient's `setOn`
 * state reads on these icons.
 */
export function RestingBonusShield({
  index,
  active,
  description,
}: RestingBonusShieldProps) {
  return (
    <div
      title={description}
      aria-label={description}
      role="img"
      className={active ? "" : "opacity-40 [filter:grayscale(1)_brightness(0.8)]"}
    >
      <PixelImage
        src={`reward-wall/bonus-${index}.png`}
        sheetWidth={64}
        sheetHeight={64}
      />
    </div>
  );
}
