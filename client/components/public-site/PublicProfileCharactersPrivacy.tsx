"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PublicProfileSection } from "./PublicProfileSection";

export function PublicProfileCharactersPrivacy() {
  const { t } = useAppTranslation();

  return (
    <PublicProfileSection title={t("publicProfile.charactersSection")}>
      <p className="px-[1.125rem] py-4 text-sm leading-6 text-ui-muted">
        {t("publicProfile.charactersPrivate")}
      </p>
    </PublicProfileSection>
  );
}
