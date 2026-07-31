"use client";

import type { PublicCharacterProfileData } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { PublicProfileSection } from "./PublicProfileSection";

interface PublicProfileDeathsProps {
  readonly deaths: PublicCharacterProfileData["deathHistory"];
}

export function PublicProfileDeaths({
  deaths,
}: PublicProfileDeathsProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const dateLocale = language === "pt-BR" ? "pt-BR" : "en-US";

  return (
    <PublicProfileSection title={t("publicProfile.recentDeaths")}>
      {deaths.length === 0 ? (
        <p className="m-3 bg-white/6 px-4 py-3 text-sm text-ui-muted sm:m-4">
          {t("publicProfile.noRecentDeaths")}
        </p>
      ) : (
        <ol className="m-3 divide-y divide-ui-stone-light/15 overflow-hidden border border-ui-stone-light/15 sm:m-4">
          {deaths.map((death, index) => (
            <li
              key={`${death.occurredAt}-${death.level}-${death.cause}`}
              className={`grid gap-1 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4 ${
                index % 2 === 0 ? "bg-white/6" : "bg-black/15"
              }`}
            >
              <time
                dateTime={death.occurredAt}
                className="text-sm font-medium text-ui-gold"
              >
                {new Intl.DateTimeFormat(dateLocale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(death.occurredAt))}
              </time>
              <span className="text-sm text-ui-text-bright">
                {death.cause ||
                  t("publicProfile.deathAtLevel", { level: death.level })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </PublicProfileSection>
  );
}
