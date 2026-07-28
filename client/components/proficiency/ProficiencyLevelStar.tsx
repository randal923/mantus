"use client";

import { PixelImage } from "../ui/PixelImage";
import { PROFICIENCY_UI_SCALE } from "./proficiencyUiScale";

interface ProficiencyLevelStarProps {
  /** 0–100 XP fill toward this level. */
  percent: number;
  /** Gold star once the whole weapon is mastered, silver when complete. */
  mastered: boolean;
  /** Compact XP still needed for this level, e.g. "1.1K"; null when done. */
  label: string | null;
  /** Tooltip, e.g. "Level 1 — 691 / 1,750 XP (1,059 to go)". */
  title: string;
}

/**
 * One column header, like OTClient's StarWidget but skinned with the game
 * palette: a 108×20 progress strip with a star — dark until the level is
 * complete, then silver/gold — followed by the XP still owed for the level.
 */
export function ProficiencyLevelStar({
  percent,
  mastered,
  label,
  title,
}: ProficiencyLevelStarProps) {
  const scale = PROFICIENCY_UI_SCALE;
  const complete = percent >= 100;

  return (
    <div
      title={title}
      className="relative flex shrink-0 items-center justify-center gap-1 overflow-hidden border border-ui-stone-light/25 bg-black/45 px-1"
      style={{ width: 108 * scale, height: 20 * scale }}
    >
      <div
        className="absolute inset-y-0 left-0 bg-ui-gold-deep/70"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
      {complete ? (
        <PixelImage
          src={`ui/proficiency/icon-star-tiny-${mastered ? "gold" : "silver"}.png`}
          sheetWidth={5}
          sheetHeight={5}
          scale={scale * 2}
          className="relative shrink-0"
        />
      ) : (
        <PixelImage
          src="ui/proficiency/icon-star-dark.png"
          sheetWidth={9}
          sheetHeight={10}
          scale={scale}
          className="relative shrink-0"
        />
      )}
      {label !== null && (
        <span className="relative truncate text-xs font-bold tabular-nums text-ui-text-bright">
          {label}
        </span>
      )}
    </div>
  );
}
