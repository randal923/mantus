"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { ButtonLink } from "../ui/ButtonLink";
import { LanguageFlagButtons } from "../ui/LanguageFlagButtons";
import { MantusLogo } from "../ui/MantusLogo";

const NAV_SECTIONS = ["news", "features", "vocations", "media"] as const;

export function LandingHeader() {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  return (
    <header className="sticky top-0 z-20 border-b border-ui-stone-light/15 bg-ui-panel-deep/85 backdrop-blur-sm">
      <div className="border-b border-ui-stone-light/10 bg-black/40">
        <div className="mx-auto flex h-8 w-full max-w-6xl items-center justify-end px-4 sm:px-6">
          <LanguageFlagButtons language={language} onChange={setLanguage} />
        </div>
      </div>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a
          href="#top"
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ui-gold/60"
        >
          <MantusLogo size="sm" />
        </a>
        <nav
          aria-label={t("landing.nav.sections")}
          className="hidden items-center gap-6 md:flex"
        >
          {NAV_SECTIONS.map((section) => (
            <a
              key={section}
              href={`#${section}`}
              className="font-display text-xs font-semibold tracking-widest text-ui-muted uppercase transition-colors hover:text-ui-text-bright"
            >
              {t(`landing.nav.${section}`)}
            </a>
          ))}
        </nav>
        <ButtonLink href="/play" variant="primary" size="sm">
          {t("landing.nav.play")}
        </ButtonLink>
      </div>
    </header>
  );
}
