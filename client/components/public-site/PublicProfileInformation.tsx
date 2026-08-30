"use client";

import type { PublicCharacterProfileData } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { PublicProfileSection } from "./PublicProfileSection";

interface PublicProfileInformationProps {
  readonly profile: PublicCharacterProfileData;
}

export function PublicProfileInformation({
  profile,
}: PublicProfileInformationProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const dateLocale = language === "pt-BR" ? "pt-BR" : "en-US";
  const rows = [
    [t("publicProfile.name"), profile.name],
    [t("publicProfile.title"), profile.title ?? t("publicProfile.noTitle")],
    [t("publicProfile.sex"), t(`characters.sexes.${profile.sex}`)],
    [
      t("publicProfile.vocation"),
      t(`vocations.${profile.vocation}.name`),
    ],
    [t("publicProfile.level"), profile.level.toLocaleString(dateLocale)],
    [
      t("publicProfile.achievementPoints"),
      profile.achievementPoints.toLocaleString(dateLocale),
    ],
    [t("publicProfile.world"), profile.worldName],
    [t("publicProfile.residence"), profile.residence],
    [
      t("publicProfile.guildMembership"),
      profile.guildName ?? t("publicProfile.noGuild"),
    ],
    [
      t("publicProfile.lastLogin"),
      profile.lastLoginAt
        ? new Intl.DateTimeFormat(dateLocale, {
            dateStyle: "medium",
            timeStyle: "long",
          }).format(new Date(profile.lastLoginAt))
        : t("publicProfile.never"),
    ],
    [
      t("publicProfile.onlineStatus"),
      profile.online ? t("publicProfile.online") : t("publicProfile.offline"),
    ],
  ] as const;

  return (
    <PublicProfileSection title={t("publicProfile.characterInformation")}>
      <dl className="divide-y divide-white/5">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid gap-1 px-[1.125rem] py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"
          >
            <dt className="font-display text-[0.6875rem] font-normal tracking-[0.18em] text-[#6e6a66] uppercase">
              {label}:
            </dt>
            <dd className="min-w-0 text-sm leading-5 text-[#b8b3ac]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </PublicProfileSection>
  );
}
