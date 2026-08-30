"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { MantusLogo } from "../ui/MantusLogo";
import { PublicAuthAction } from "../public-site/PublicAuthAction";

export function LandingBanner() {
  const { t } = useAppTranslation();

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center gap-6 px-4 pt-16 pb-12 text-center sm:px-6">
      <MantusLogo size="lg" className="drop-shadow-[0_6px_24px_rgba(0,0,0,0.9)]" />
      <div className="flex flex-col items-center gap-2.5">
        <PublicAuthAction
          size="lg"
          className="min-w-52 shadow-[0_10px_36px_rgba(0,0,0,0.7)]"
          guestLabel={t("landing.hero.cta")}
        />
        <p className="font-display text-sm font-bold tracking-[0.2em] text-ui-text-bright uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {t("landing.hero.beta")}
        </p>
        <p className="text-sm text-ui-muted drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {t("landing.hero.note")}
        </p>
      </div>
    </div>
  );
}
