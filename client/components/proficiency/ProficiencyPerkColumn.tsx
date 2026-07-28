"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatProficiencyPerk } from "../../lib/proficiency/formatProficiencyPerk";
import type { ProficiencyPerk } from "../../lib/proficiency/ProficiencyProfile";
import { ProficiencyPerkTile } from "./ProficiencyPerkTile";
import { PROFICIENCY_UI_SCALE } from "./proficiencyUiScale";

interface ProficiencyPerkColumnProps {
  levelIndex: number;
  perks: ReadonlyArray<ProficiencyPerk>;
  unlocked: boolean;
  /** 0–100 XP fill toward this level, drawn bottom-up like OTClient. */
  percent: number;
  /** Draft pick for this level, or null when nothing is picked. */
  selectedIndex: number | null;
  disabled: boolean;
  onPick: (index: number | null) => void;
}

/**
 * Vertical tile gap per perk count, from BonusSelectPanel's anchors: two
 * tiles sit 49px off each end of the 354px panel (354 - 49*2 - 80*2 = 96),
 * three tiles are spaced 38px apart. Both land the group on the panel's
 * centre line, so single-perk levels line up with the middle of a three.
 */
const GAP_BY_COUNT: Readonly<Record<number, number>> = { 2: 96, 3: 38 };

/**
 * One perk level as OTClient's BonusSelectPanel: a 108×354 column whose
 * background fills with the level's XP, holding one to three perk tiles.
 * Picking the selected perk again clears the level (selections are a full
 * replacement server-side).
 */
export function ProficiencyPerkColumn({
  levelIndex,
  perks,
  unlocked,
  percent,
  selectedIndex,
  disabled,
  onPick,
}: ProficiencyPerkColumnProps) {
  const { t } = useAppTranslation();
  const scale = PROFICIENCY_UI_SCALE;
  const label = t("proficiency.levelLabel", { level: levelIndex + 1 });
  const fillPercent = Math.max(0, Math.min(100, percent));

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative shrink-0 overflow-hidden border-r border-ui-stone-light/15 bg-black/30 first:border-l"
      style={{ width: 108 * scale, height: 354 * scale }}
    >
      <div
        className="absolute inset-x-0 bottom-0 bg-ui-gold-deep/30"
        style={{ height: `${fillPercent}%` }}
      />
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ gap: (GAP_BY_COUNT[perks.length] ?? 0) * scale }}
      >
        {perks.map((perk, index) => {
          const checked = unlocked && selectedIndex === index;
          return (
            <ProficiencyPerkTile
              key={index}
              perk={perk}
              label={formatProficiencyPerk(perk, t)}
              checked={checked}
              locked={!unlocked}
              disabled={disabled}
              onClick={() => onPick(checked ? null : index)}
            />
          );
        })}
      </div>
    </div>
  );
}
