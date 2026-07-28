"use client";

import type { ProficiencyPerk } from "../../lib/proficiency/ProficiencyProfile";
import { getProficiencyPerkIcon } from "../../lib/proficiency/getProficiencyPerkIcon";
import { PixelImage } from "../ui/PixelImage";
import { PROFICIENCY_UI_SCALE } from "./proficiencyUiScale";

interface ProficiencyPerkTileProps {
  perk: ProficiencyPerk;
  /** Full formatted perk text; the tooltip and accessible name. */
  label: string;
  checked: boolean;
  locked: boolean;
  disabled: boolean;
  onClick: () => void;
}

const CENTER =
  "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2";

/**
 * One perk icon, layered like OTClient's BonusIcon widget: highlight
 * backdrop when picked, gold/dark 76px frame, the 64px sheet icon (grey row
 * while locked), the 32px augment badge overhanging top-right, and the lock
 * at the bottom edge. Locked tiles are display-only.
 */
export function ProficiencyPerkTile({
  perk,
  label,
  checked,
  locked,
  disabled,
  onClick,
}: ProficiencyPerkTileProps) {
  const scale = PROFICIENCY_UI_SCALE;
  const icon = getProficiencyPerkIcon(perk);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={locked || disabled}
      onClick={onClick}
      className="relative shrink-0 transition-[filter] disabled:cursor-not-allowed enabled:hover:brightness-125"
      style={{ width: 80 * scale, height: 80 * scale }}
    >
      {checked && (
        <PixelImage
          src="ui/proficiency/backdrop_weaponmastery_highlight.png"
          sheetWidth={80}
          sheetHeight={80}
          scale={scale}
          className={CENTER}
        />
      )}
      <PixelImage
        src={`ui/proficiency/border-weaponmasterytreeicons-${
          checked ? "active" : "inactive"
        }.png`}
        sheetWidth={76}
        sheetHeight={76}
        scale={scale}
        className={CENTER}
      />
      <PixelImage
        src={locked ? icon.greySheet : icon.sheet}
        sheetWidth={icon.sheetWidth}
        sheetHeight={icon.sheetHeight}
        x={icon.x}
        y={locked ? icon.greyY : icon.y}
        width={64}
        height={64}
        scale={scale}
        className={CENTER}
      />
      {icon.badgeX !== null && (
        <PixelImage
          src="ui/proficiency/augment-icons.png"
          sheetWidth={416}
          sheetHeight={64}
          x={icon.badgeX}
          y={locked ? 32 : 0}
          width={32}
          height={32}
          scale={scale}
          className="absolute"
          style={{ top: -6 * scale, right: -6 * scale }}
        />
      )}
      {locked && (
        <PixelImage
          src="ui/proficiency/big-icon-lock-grey.png"
          sheetWidth={18}
          sheetHeight={28}
          scale={scale}
          className="absolute left-1/2 -translate-x-1/2"
          style={{ bottom: -4 * scale }}
        />
      )}
    </button>
  );
}
