"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { MantusLogo } from "../ui/MantusLogo";

export function LandingFooter() {
  const { t } = useAppTranslation();

  return (
    <footer className="border-t border-ui-stone-light/15 bg-ui-panel-deep/80">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-10 sm:px-6">
        <MantusLogo size="sm" />
        <div aria-hidden className="ui-divider w-full max-w-md" />
        <p className="text-center text-sm text-ui-muted">
          {t("landing.footer.copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
