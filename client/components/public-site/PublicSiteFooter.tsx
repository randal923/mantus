"use client";

import Link from "next/link";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { MantusLogo } from "../ui/MantusLogo";

export function PublicSiteFooter() {
  const { t } = useAppTranslation();

  return (
    <footer className="mt-10 border-t border-ui-stone-light/15 bg-ui-panel-deep/90">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex flex-col items-start gap-4">
          <MantusLogo size="sm" />
          <p className="max-w-xl text-sm leading-6 text-ui-muted">
            {t("landing.footer.description")}
          </p>
        </div>
        <nav
          aria-label={t("landing.footer.links")}
          className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-ui-muted"
        >
          <Link href="/#latest-news" className="hover:text-ui-text-bright">
            {t("landing.nav.news")}
          </Link>
          <Link href="/highscores" className="hover:text-ui-text-bright">
            {t("landing.menu.community.highscores")}
          </Link>
          <Link href="/online" className="hover:text-ui-text-bright">
            {t("landing.menu.community.online")}
          </Link>
          <Link href="/server-info" className="hover:text-ui-text-bright">
            {t("publicSite.menu.game.serverInfo")}
          </Link>
          <Link href="/play" className="hover:text-ui-text-bright">
            {t("landing.nav.play")}
          </Link>
        </nav>
      </div>
      <div className="border-t border-ui-stone-light/10 bg-black/25">
        <p className="mx-auto w-full max-w-7xl px-4 py-4 text-xs text-ui-muted sm:px-6">
          {t("landing.footer.copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
