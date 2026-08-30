"use client";

import Link from "next/link";
import { useAppTranslation } from "../../i18n/useAppTranslation";

export function PublicSiteFooter() {
  const { t } = useAppTranslation();

  return (
    <footer className="relative z-10 mt-16 border-t border-white/5">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-10 gap-y-3 px-4 py-8 text-xs text-[#5f5c58] sm:px-6">
        <p>{t("landing.footer.copyright", { year: new Date().getFullYear() })}</p>
        <nav
          aria-label={t("landing.footer.links")}
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          <Link href="/#latest-news" className="transition-colors hover:text-ui-text-bright">
            {t("landing.nav.news")}
          </Link>
          <Link href="/highscores" className="transition-colors hover:text-ui-text-bright">
            {t("landing.menu.community.highscores")}
          </Link>
          <Link href="/online" className="transition-colors hover:text-ui-text-bright">
            {t("landing.menu.community.online")}
          </Link>
          <Link href="/server-info" className="transition-colors hover:text-ui-text-bright">
            {t("publicSite.menu.game.serverInfo")}
          </Link>
          <Link href="/play" className="transition-colors hover:text-ui-text-bright">
            {t("landing.nav.play")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
