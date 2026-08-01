"use client";

import type {
  HuntingTeamSize,
  HuntingVocation,
} from "../../lib/hunt-finder/HuntingPlace";
import type { HuntingGuideSort } from "../../lib/hunt-finder/filterHuntingPlaces";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Dropdown } from "../ui/Dropdown";
import { Input } from "../ui/Input";

const VOCATIONS: ReadonlyArray<HuntingVocation> = [
  "Knight",
  "Paladin",
  "Druid",
  "Sorcerer",
  "Monk",
];
const TEAM_SIZES: ReadonlyArray<HuntingTeamSize> = [
  "Solo",
  "Duo",
  "Party x4",
];

interface HuntFinderFiltersProps {
  minimumLevel: number;
  vocation: HuntingVocation | "all";
  teamSize: HuntingTeamSize | "all";
  sort: HuntingGuideSort;
  search: string;
  onMinimumLevelChange: (level: number) => void;
  onVocationChange: (vocation: HuntingVocation | "all") => void;
  onTeamSizeChange: (teamSize: HuntingTeamSize | "all") => void;
  onSortChange: (sort: HuntingGuideSort) => void;
  onSearchChange: (search: string) => void;
}

export function HuntFinderFilters({
  minimumLevel,
  vocation,
  teamSize,
  sort,
  search,
  onMinimumLevelChange,
  onVocationChange,
  onTeamSizeChange,
  onSortChange,
  onSearchChange,
}: HuntFinderFiltersProps) {
  const { t } = useAppTranslation();
  return (
    <div className="ui-panel-inset grid shrink-0 grid-cols-2 gap-3 rounded-sm border border-ui-stone-light/15 p-3 md:grid-cols-5 xl:grid-cols-[0.7fr_1fr_1fr_1fr_1.6fr]">
      <Input
        label={t("huntFinder.filters.level")}
        aria-label={t("huntFinder.filters.level")}
        type="number"
        min={0}
        max={2_000}
        value={minimumLevel}
        onChange={(event) => {
          const value = Number(event.currentTarget.value);
          onMinimumLevelChange(
            Number.isFinite(value) ? Math.min(2_000, Math.max(0, value)) : 0,
          );
        }}
      />
      <Dropdown
        label={t("huntFinder.filters.vocation")}
        ariaLabel={t("huntFinder.filters.vocation")}
        value={vocation}
        options={[
          { value: "all", label: t("huntFinder.filters.all") },
          ...VOCATIONS.map((value) => ({ value, label: value })),
        ]}
        onChange={onVocationChange}
      />
      <Dropdown
        label={t("huntFinder.filters.teamSize")}
        ariaLabel={t("huntFinder.filters.teamSize")}
        value={teamSize}
        options={[
          { value: "all", label: t("huntFinder.filters.all") },
          ...TEAM_SIZES.map((value) => ({ value, label: value })),
        ]}
        onChange={onTeamSizeChange}
      />
      <Dropdown
        label={t("huntFinder.filters.type")}
        ariaLabel={t("huntFinder.filters.type")}
        value={sort}
        options={[
          { value: "balanced", label: t("huntFinder.filters.balanced") },
          { value: "experience", label: t("huntFinder.filters.experience") },
          { value: "loot", label: t("huntFinder.filters.loot") },
        ]}
        onChange={onSortChange}
      />
      <Input
        className="col-span-2 md:col-span-1"
        label={t("huntFinder.filters.search")}
        aria-label={t("huntFinder.filters.search")}
        placeholder={t("huntFinder.filters.searchPlaceholder")}
        value={search}
        maxLength={100}
        onChange={(event) => onSearchChange(event.currentTarget.value)}
      />
    </div>
  );
}
