"use client";

import { PixelImage } from "../ui/PixelImage";
import { PREY_UI_SCALE } from "./preyUiScale";

interface PreyBonusFlagProps {
  /** Which flag banner to fly. */
  variant: "damage" | "defense" | "experience" | "loot" | "none" | "locked";
  /** Filled stars under the flag. */
  stars: number;
  /** Total star cells (10 for prey rarity, 5 for task difficulty). */
  maxStars: number;
  /** Accessible name for the flag + stars group. */
  label: string;
  /** Extra line under the stars (e.g. task reward points). */
  footer?: string;
}

const FLAG_BY_VARIANT: Readonly<Record<PreyBonusFlagProps["variant"], string>> =
  {
    damage: "prey_bigdamage",
    defense: "prey_bigdefense",
    experience: "prey_bigxp",
    loot: "prey_bigloot",
    none: "prey_bignobonus",
    locked: "prey_bignobonus",
  };

/**
 * The bonus banner beside the creature box, like OTClient's bonus panel:
 * the big flag for the rolled bonus type with the rarity stars in two rows
 * of five underneath. Locked slots fly a grey flag with a "?".
 */
export function PreyBonusFlag({
  variant,
  stars,
  maxStars,
  label,
  footer,
}: PreyBonusFlagProps) {
  const scale = PREY_UI_SCALE;

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className="flex flex-col items-center gap-1 rounded-sm border border-ui-stone-light/15 bg-black/25 px-2 py-1"
    >
      <span className="relative">
        <PixelImage
          src={`ui/prey/${FLAG_BY_VARIANT[variant]}.png`}
          sheetWidth={44}
          sheetHeight={92}
          scale={scale}
          className={variant === "locked" ? "opacity-50 grayscale" : ""}
        />
        {variant === "locked" && (
          <span
            aria-hidden
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-2xl text-ui-muted"
          >
            ?
          </span>
        )}
      </span>
      <span aria-hidden className="h-px w-full bg-ui-stone-light/25" />
      <span
        aria-hidden
        className="grid justify-center gap-0.5"
        style={{ gridTemplateColumns: `repeat(5, ${9 * scale}px)` }}
      >
        {Array.from({ length: maxStars }, (_, index) => (
          <PixelImage
            key={index}
            src={`ui/prey/${index < stars ? "prey_star" : "prey_nostar"}.png`}
            sheetWidth={9}
            sheetHeight={10}
            scale={scale}
          />
        ))}
      </span>
      {footer !== undefined && (
        <span className="text-sm leading-none tabular-nums text-ui-text-bright">
          {footer}
        </span>
      )}
    </div>
  );
}
