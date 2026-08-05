"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PublicAuthAction } from "../public-site/PublicAuthAction";
import { LandingMenuLink } from "./LandingMenuLink";
import { LandingWikiMenu } from "./LandingWikiMenu";

const MENU_GROUPS = [
  {
    key: "news",
    links: [{ key: "latest", href: "/#latest-news" }],
  },
  {
    key: "game",
    links: [
      { key: "vocations", href: "/vocations" },
      { key: "serverInfo", href: "/server-info" },
    ],
  },
  {
    key: "community",
    links: [
      { key: "highscores", href: "/highscores" },
      { key: "online", href: "/online" },
      { key: "guilds", href: "/play" },
    ],
  },
] as const;

export function LandingNavigation() {
  const { t } = useAppTranslation();

  return (
    <aside className="order-2 flex flex-col gap-4 md:order-1">
      <div className="ui-panel-frame relative overflow-hidden p-3">
        <PublicAuthAction
          className="h-12 w-full justify-center text-sm"
        />
        <p className="px-2 pt-3 text-center text-xs leading-relaxed text-ui-muted">
          {t("landing.menu.playNote")}
        </p>
      </div>

      <nav
        aria-label={t("landing.nav.sections")}
        className="ui-panel-frame relative overflow-hidden"
      >
        {MENU_GROUPS.map((group) => (
          <section
            key={group.key}
            className="border-b border-ui-stone-light/15 last:border-b-0"
          >
            <h2 className="border-b border-ui-stone-light/15 bg-black/35 px-4 py-2.5 font-display text-xs font-bold tracking-widest text-ui-text-bright uppercase">
              {t(`landing.menu.${group.key}.title`)}
            </h2>
            <ul className="py-1.5">
              {group.links.map((link) => (
                <li key={link.key}>
                  <LandingMenuLink
                    href={link.href}
                    label={t(`landing.menu.${group.key}.${link.key}`)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <LandingWikiMenu />
      </nav>

      <section className="ui-panel-frame relative overflow-hidden p-4">
        <p className="font-display text-xs font-bold tracking-widest text-ui-text-bright uppercase">
          {t("landing.menu.account.title")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ui-muted">
          {t("landing.menu.account.description")}
        </p>
        <PublicAuthAction
          className="mt-4 w-full justify-center"
          size="sm"
          variant="secondary"
        />
      </section>
    </aside>
  );
}
