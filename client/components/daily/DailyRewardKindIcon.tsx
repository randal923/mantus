"use client";

import type { DailyRewardKind } from "@tibia/protocol";
import { getDailyRewardKindIcon } from "../../lib/daily/getDailyRewardKindIcon";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { PixelImage } from "../ui/PixelImage";

interface DailyRewardKindIconProps {
  kind: DailyRewardKind;
  className?: string;
}

/** Large reward artwork for one day in the calendar row. */
export function DailyRewardKindIcon({
  kind,
  className,
}: DailyRewardKindIconProps) {
  if (kind === "training-items") {
    return (
      <SpriteIcon
        spriteId={25_676}
        clientId={28_552}
        scale={2.5}
        className={className}
      />
    );
  }

  if (kind === "wildcards") {
    return (
      <PixelImage
        src="ui/prey/prey_select.png"
        sheetWidth={64}
        sheetHeight={64}
        scale={1.25}
        className={className}
      />
    );
  }

  return (
    <PixelImage
      src={getDailyRewardKindIcon(kind)}
      sheetWidth={64}
      sheetHeight={64}
      scale={1.25}
      className={className}
    />
  );
}
