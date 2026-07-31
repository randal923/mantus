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
      <dl className="m-3 overflow-hidden border border-ui-stone-light/15 sm:m-4">
        <div className="grid gap-1 bg-white/6 px-4 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
          <dt className="font-display text-xs font-bold tracking-wide text-ui-gold uppercase">
            {t("publicProfile.characterCreated")}:
          </dt>
          <dd className="text-sm text-ui-text-bright">
            {new Intl.DateTimeFormat(dateLocale, {
              dateStyle: "long",
              timeStyle: "short",
            }).format(new Date(createdAt))}
          </dd>
        </div>
        <div className="grid gap-1 bg-black/15 px-4 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
          <dt className="font-display text-xs font-bold tracking-wide text-ui-gold uppercase">
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
