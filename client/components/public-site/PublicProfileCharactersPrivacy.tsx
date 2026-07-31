"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PublicProfileSection } from "./PublicProfileSection";

export function PublicProfileCharactersPrivacy() {
  const { t } = useAppTranslation();

  return (
    <PublicProfileSection title={t("publicProfile.charactersSection")}>
      <p className="m-3 border border-ui-stone-light/15 bg-white/6 px-4 py-3 text-sm leading-6 text-ui-muted sm:m-4">
        {t("publicProfile.charactersPrivate")}
      </p>
    </PublicProfileSection>
  );
}
