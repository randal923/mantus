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
        <p className="px-[1.125rem] py-4 text-sm text-ui-muted">
          {t("publicProfile.noRecentDeaths")}
        </p>
      ) : (
        <ol className="divide-y divide-white/5">
          {deaths.map((death) => (
            <li
              key={`${death.occurredAt}-${death.level}-${death.cause}`}
              className="grid gap-1 px-[1.125rem] py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"
            >
              <time
                dateTime={death.occurredAt}
                className="text-sm font-medium text-[#c9a06a]"
              >
                {new Intl.DateTimeFormat(dateLocale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(death.occurredAt))}
              </time>
              <span className="text-sm text-[#b8b3ac]">
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
