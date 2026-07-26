"use client";

import { CYCLOPEDIA_LIMITS, type CyclopediaDeathsStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface WikiCharacterDeathsProps {
  deaths: CyclopediaDeathsStateMessage | null;
  pending: boolean;
}

/** Paged recent-death log; paging runs through the modal pagination bar. */
export function WikiCharacterDeaths({
  deaths,
  pending,
}: WikiCharacterDeathsProps) {
  const { t } = useAppTranslation();
  if (!deaths) {
    return (
      <p className="py-12 text-center text-sm text-ui-muted">
        {pending
          ? t("wiki.character.loading")
          : t("wiki.character.deaths.unavailable")}
      </p>
    );
  }
  if (deaths.entries.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ui-muted">
        {t("wiki.character.deaths.empty", {
          days: CYCLOPEDIA_LIMITS.deathsWindowDays,
        })}
      </p>
    );
  }

  return (
    <ul aria-label={t("wiki.character.tabs.deaths")} className="space-y-2">
      {deaths.entries.map((entry, index) => (
        <li
          key={`${entry.at}-${index}`}
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border border-ui-stone-light/15 bg-black/25 p-3"
        >
          <span className="shrink-0 text-xs tabular-nums text-ui-muted">
            {new Date(entry.at).toLocaleString()}
          </span>
          <span className="shrink-0 rounded-sm border border-ui-stone-light/20 bg-black/25 px-1.5 py-0.5 text-xs tracking-wide text-ui-gold">
            {t("wiki.character.deaths.level", { level: entry.level })}
          </span>
          <span className="min-w-0 flex-1 text-sm text-ui-text/85">
            {entry.cause}
          </span>
        </li>
      ))}
    </ul>
  );
}
