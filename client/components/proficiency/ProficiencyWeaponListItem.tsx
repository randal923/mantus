"use client";

import type { ProficiencyWeaponState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { ProgressionBar } from "../inventory/ProgressionBar";

interface ProficiencyWeaponListItemProps {
  weapon: ProficiencyWeaponState;
  /** Profile name from the static catalog; falls back to the id. */
  name: string;
  selected: boolean;
  onSelect: () => void;
}

/** One tracked weapon with its server-accrued proficiency progress. */
export function ProficiencyWeaponListItem({
  weapon,
  name,
  selected,
  onSelect,
}: ProficiencyWeaponListItemProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const experienceLabel = weapon.mastered
    ? weapon.experience.toLocaleString(language)
    : `${weapon.experience.toLocaleString(language)} / ${(
        weapon.nextLevelExperience ?? weapon.experience
      ).toLocaleString(language)}`;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full rounded-md border p-3 text-left transition-colors ${
        selected
          ? "border-ui-gold/60 bg-ui-gold/10"
          : "border-ui-stone-light/15 bg-black/25 hover:border-ui-gold/40"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-display text-sm font-semibold text-ui-text-bright">
          {name}
        </span>
        {weapon.mastered && (
          <span className="shrink-0 rounded-full border border-ui-gold/40 bg-ui-gold-deep/40 px-2 py-0.5 text-xs tracking-wide text-ui-gold uppercase">
            {t("proficiency.mastered")}
          </span>
        )}
      </span>
      <span className="mt-2 block">
        <ProgressionBar
          label={t("proficiency.experience")}
          value={weapon.experience}
          max={weapon.nextLevelExperience ?? weapon.experience}
          valueLabel={experienceLabel}
        />
      </span>
      <span className="mt-1.5 block text-xs text-ui-muted">
        {t("proficiency.unlockedLevels", { levels: weapon.unlockedLevels })}
      </span>
    </button>
  );
}
