"use client";

import type { PublicCharacterProfileData } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { PublicProfileSection } from "./PublicProfileSection";

interface PublicProfileAccountInformationProps {
  readonly createdAt: PublicCharacterProfileData["createdAt"];
}

export function PublicProfileAccountInformation({
  createdAt,
}: PublicProfileAccountInformationProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const dateLocale = language === "pt-BR" ? "pt-BR" : "en-US";

  return (
    <PublicProfileSection title={t("publicProfile.accountInformation")}>
      <dl className="divide-y divide-white/5">
        <div className="grid gap-1 px-[1.125rem] py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
          <dt className="font-display text-[0.6875rem] font-normal tracking-[0.18em] text-[#6e6a66] uppercase">
            {t("publicProfile.characterCreated")}:
          </dt>
          <dd className="text-sm text-[#b8b3ac]">
            {new Intl.DateTimeFormat(dateLocale, {
              dateStyle: "long",
              timeStyle: "short",
            }).format(new Date(createdAt))}
          </dd>
        </div>
        <div className="grid gap-1 px-[1.125rem] py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
          <dt className="font-display text-[0.6875rem] font-normal tracking-[0.18em] text-[#6e6a66] uppercase">
            {t("publicProfile.accountStatus")}:
          </dt>
          <dd className="text-sm text-ui-muted">
            {t("publicProfile.accountPrivate")}
          </dd>
        </div>
      </dl>
    </PublicProfileSection>
  );
}
