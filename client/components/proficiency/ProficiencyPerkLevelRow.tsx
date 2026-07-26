"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatProficiencyPerk } from "../../lib/proficiency/formatProficiencyPerk";
import type { ProficiencyPerk } from "../../lib/proficiency/ProficiencyProfile";

interface ProficiencyPerkLevelRowProps {
  levelIndex: number;
  perks: ReadonlyArray<ProficiencyPerk>;
  unlocked: boolean;
  /** Server-provided XP threshold hint for the next locked row, or null. */
  unlockHint: string | null;
  /** Draft pick for this level, or null when nothing is picked. */
  selectedIndex: number | null;
  disabled: boolean;
  onPick: (index: number | null) => void;
}

/**
 * One perk row: a radio-style pick among the level's perks. Picking the
 * selected perk again clears the level (selections are a full replacement
 * server-side). Locked rows are display-only.
 */
export function ProficiencyPerkLevelRow({
  levelIndex,
  perks,
  unlocked,
  unlockHint,
  selectedIndex,
  disabled,
  onPick,
}: ProficiencyPerkLevelRowProps) {
  const { t } = useAppTranslation();
  const label = t("proficiency.levelLabel", { level: levelIndex + 1 });

  return (
    <div
      className={`rounded-md border p-3 ${
        unlocked
          ? "border-ui-stone-light/15 bg-black/25"
          : "border-ui-stone-light/10 bg-black/15 opacity-60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
          {label}
        </span>
        {!unlocked && (
          <span className="rounded-sm border border-ui-stone-light/20 bg-black/25 px-1.5 py-0.5 text-xs tracking-wide text-ui-muted uppercase">
            {unlockHint ?? t("proficiency.locked")}
          </span>
        )}
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-2 grid gap-2 sm:grid-cols-3"
      >
        {perks.map((perk, index) => {
          const checked = unlocked && selectedIndex === index;
          return (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={!unlocked || disabled}
              onClick={() => onPick(checked ? null : index)}
              className={`flex items-center gap-2 rounded-sm border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed ${
                checked
                  ? "border-ui-gold/60 bg-ui-gold/10 text-ui-text-bright"
                  : "border-ui-stone-light/15 bg-black/20 text-ui-text/85 enabled:hover:border-ui-gold/40"
              }`}
            >
              <span
                aria-hidden
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  checked
                    ? "border-ui-gold bg-ui-gold/20"
                    : "border-ui-stone-light/40"
                }`}
              >
                {checked && (
                  <span className="size-2 rounded-full bg-ui-gold" />
                )}
              </span>
              <span className="min-w-0 leading-5">
                {formatProficiencyPerk(perk, t)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
