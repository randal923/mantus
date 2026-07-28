"use client";

import type { ReactNode } from "react";
import { PixelImage } from "../ui/PixelImage";
import { PREY_UI_SCALE } from "./preyUiScale";

export interface PreyActionCardImage {
  src: string;
  sheetWidth: number;
  sheetHeight: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface PreyActionCardProps {
  label: string;
  image: PreyActionCardImage;
  /** Greyed art shown instead while disabled, when Tibia ships one. */
  blockedImage?: PreyActionCardImage;
  disabled: boolean;
  onClick: () => void;
  /** Cost plate under the button (PreyCostPlate) or a countdown strip. */
  plate?: ReactNode;
  /** 55px-wide card (bonus reroll / checkmark) instead of the 70px default. */
  narrow?: boolean;
}

/**
 * One prey card button, like OTClient's RerollButton/SelectPreyCreature/
 * BonusReroll panels: the card art centered in a framed cell with its price
 * plate underneath. The click only sends an intent; the server re-validates
 * balances and slot state at execution time.
 */
export function PreyActionCard({
  label,
  image,
  blockedImage,
  disabled,
  onClick,
  plate,
  narrow = false,
}: PreyActionCardProps) {
  const scale = PREY_UI_SCALE;
  const art = disabled && blockedImage ? blockedImage : image;

  return (
    <div
      className="flex flex-col items-center gap-1 rounded-sm border border-ui-stone-light/20 bg-black/25 p-1"
      style={{ width: (narrow ? 55 : 70) * scale }}
    >
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className="flex w-full items-center justify-center transition-[filter] disabled:cursor-not-allowed disabled:opacity-80 enabled:hover:brightness-125"
        style={{ height: 55 * scale }}
      >
        <PixelImage
          src={art.src}
          sheetWidth={art.sheetWidth}
          sheetHeight={art.sheetHeight}
          x={art.x}
          y={art.y}
          width={art.width}
          height={art.height}
          scale={scale}
        />
      </button>
      {plate}
    </div>
  );
}
