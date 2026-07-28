"use client";

import { PixelImage } from "../ui/PixelImage";
import { PROFICIENCY_UI_SCALE } from "./proficiencyUiScale";

interface ProficiencyPerkDetailCellProps {
  /** The picked perk's formatted text; null when nothing is picked. */
  label: string | null;
  locked: boolean;
  /** XP still owed for this level, drawn under the lock. */
  lockedHint: string | null;
  /** Tooltip for locked cells, e.g. the unlock-XP hint. */
  title?: string;
}

/**
 * The per-column footer, like OTClient's BonusDetailPanel: the picked
 * perk's name, or a lock plus the XP still owed while the level is sealed.
 * Borders match ProficiencyPerkColumn so the footer stays column-aligned.
 */
export function ProficiencyPerkDetailCell({
  label,
  locked,
  lockedHint,
  title,
}: ProficiencyPerkDetailCellProps) {
  const scale = PROFICIENCY_UI_SCALE;

  return (
    <div
      title={title}
      className="flex shrink-0 items-center justify-center border-y border-r border-ui-stone-light/20 bg-black/40 p-1 text-center first:border-l"
      style={{ width: 108 * scale, height: 77 * scale }}
    >
      {locked ? (
        <span className="flex flex-col items-center gap-1">
          <PixelImage
            src="ui/proficiency/icon-lock-grey.png"
            sheetWidth={9}
            sheetHeight={14}
            scale={scale}
          />
          {lockedHint !== null && (
            <span className="text-xs tabular-nums text-ui-muted">
              {lockedHint}
            </span>
          )}
          <span className="sr-only">{title}</span>
        </span>
      ) : (
        <span className="line-clamp-4 text-sm leading-tight text-ui-text/85">
          {label}
        </span>
      )}
    </div>
  );
}
