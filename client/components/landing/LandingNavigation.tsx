"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
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
      { key: "vipAccount", href: "/vip-account" },
    ],
  },
  {
    key: "community",
    links: [
      { key: "highscores", href: "/highscores" },
      { key: "online", href: "/online" },
      { key: "guilds", href: "/guilds" },
    ],
  },
] as const;

export function LandingNavigation() {
  const { t } = useAppTranslation();

  return (
    <aside className="order-2 md:order-1">
      <nav
        aria-label={t("landing.nav.sections")}
        className="portal-box overflow-hidden"
      >
        {MENU_GROUPS.map((group) => (
          <section key={group.key}>
            <h2 className="portal-box-header font-display text-sm font-bold tracking-widest uppercase">
              <span
                aria-hidden
                className="size-1.5 rotate-45 border border-ui-stone-light/60 bg-ui-stone-light/15"
              />
              <span className="portal-box-title">{t(`landing.menu.${group.key}.title`)}</span>
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
    </aside>
  );
}
