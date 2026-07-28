"use client";

import { PixelImage } from "../ui/PixelImage";
import { PREY_UI_SCALE } from "./preyUiScale";

interface PreyCostPlateProps {
  /** Formatted amount or the localized "Free" text. */
  value: string;
  icon: "wildcard" | "gold" | "none";
  /** Grey strike-through, like Tibia's waived gold price on a free reroll. */
  struck?: boolean;
  /** Accessible name; defaults to the visible value. */
  label?: string;
}

/**
 * The dark price plate under a prey card button, like OTClient's
 * CardLabel/GoldLabel: right-aligned amount plus the wildcard or gold icon.
 */
export function PreyCostPlate({
  value,
  icon,
  struck = false,
  label,
}: PreyCostPlateProps) {
  const scale = PREY_UI_SCALE;

  return (
    <span
      aria-label={label ?? value}
      className="flex w-full items-center justify-end gap-1.5 border border-black/80 bg-black/60 px-1.5 tabular-nums"
      style={{ height: 21 * scale }}
    >
      <span
        className={`text-sm leading-none ${
          struck ? "text-ui-muted line-through" : "text-ui-text-bright"
        }`}
      >
        {value}
      </span>
      {icon === "wildcard" && (
        <PixelImage
          src="ui/prey/prey_wildcard.png"
          sheetWidth={12}
          sheetHeight={12}
          scale={scale}
        />
      )}
      {icon === "gold" && (
        <PixelImage
          src="ui/prey/prey_gold.png"
          sheetWidth={9}
          sheetHeight={9}
          scale={scale}
        />
      )}
    </span>
  );
}
