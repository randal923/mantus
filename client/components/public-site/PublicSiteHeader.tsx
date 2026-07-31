"use client";

import Link from "next/link";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { LanguageFlagButtons } from "../ui/LanguageFlagButtons";
import { MantusLogo } from "../ui/MantusLogo";
import { PublicAuthAction } from "./PublicAuthAction";

export function PublicSiteHeader() {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  return (
    <header className="sticky top-0 z-50 border-b border-ui-stone-light/20 bg-black/90 shadow-2xl shadow-black/60 backdrop-blur-md">
      <div className="h-1 bg-linear-to-r from-ui-accent-deep via-ui-accent-light to-ui-accent-deep" />
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          aria-label={t("brand.name")}
          className="shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ui-gold/60"
        >
          <MantusLogo size="sm" />
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <LanguageFlagButtons language={language} onChange={setLanguage} />
          <span className="hidden sm:block">
            <PublicAuthAction size="sm" />
          </span>
        </div>
      </div>
    </header>
  );
}
