"use client";

import Link from "next/link";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { DiscordIcon } from "../ui/DiscordIcon";
import { PublicAuthAction } from "../public-site/PublicAuthAction";
import { useLandingWorldData } from "./useLandingWorldData";

export function LandingWorldSidebar() {
  const { t } = useAppTranslation();
  const world = useLandingWorldData();
  const data = world.data;

  return (
    <aside className="order-3 grid gap-4 self-start md:col-span-2 md:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
      <section className="portal-box overflow-hidden">
        <h2 className="portal-box-header">
          <span className="portal-box-title">{t("landing.menu.account.title")}</span>
        </h2>
        <div className="p-4">
          <PublicAuthAction className="w-full justify-center" />
          <a href="#" className="portal-btn-ghost mt-2.5 w-full py-2.5">
            <DiscordIcon className="size-4" />
            {t("landing.community.discord")}
          </a>
          <p className="mt-3 text-center text-xs leading-relaxed text-[#8a8681]">
            {t("landing.menu.playNote")}
          </p>
        </div>
      </section>

      <section
        id="world-status"
        aria-live="polite"
        className="portal-box scroll-mt-28 overflow-hidden"
      >
        <h2 className="portal-box-header">
          <span className="portal-box-title">{t("landing.world.status.title")}</span>
        </h2>
        <div className="flex items-center gap-3 px-[1.125rem] py-3.5">
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full ${
              data
                ? "bg-ui-success-light shadow-[0_0_10px_rgba(143,175,127,0.9)]"
                : "bg-ui-muted"
            }`}
          />
          <p className="text-sm text-[#b8b3ac]">
            {data
              ? t("landing.world.status.players", {
                  count: data.playersOnline,
                })
              : world.status === "loading"
                ? t("common.loading")
                : t("landing.world.unavailable")}
          </p>
        </div>
        <div className="flex justify-between border-t border-white/5 px-[1.125rem] py-3 text-sm">
          <span className="text-[#66625e]">{t("landing.world.status.world")}</span>
          <span className="text-[#b8b3ac]">{data?.worldName ?? "Mantus"}</span>
        </div>
        <div className="flex justify-between border-t border-white/5 px-[1.125rem] py-3 text-sm">
          <span className="text-[#66625e]">{t("landing.world.status.type")}</span>
          <span className="text-[#b8b3ac]">Open PvP</span>
        </div>
      </section>

      <section id="highscores" className="portal-box scroll-mt-28 overflow-hidden">
        <h2 className="portal-box-header">
          <span className="portal-box-title">{t("landing.world.highscores.title")}</span>
        </h2>
        {data?.highscores.length ? (
          <ol>
            {data.highscores.map((entry) => (
              <li
                key={entry.name}
                className="flex items-center gap-3 border-t border-white/5 px-[1.125rem] py-3 first:border-t-0"
              >
                <span className="w-4 shrink-0 font-display text-xs font-bold text-[#c9a06a]">
                  {entry.rank}
                </span>
                <Link
                  href={`/characters/${encodeURIComponent(entry.name)}`}
                  className="min-w-0 flex-1 truncate text-sm text-[#b8b3ac] transition-colors hover:text-ui-text-bright"
                >
                  {entry.name}
                </Link>
                <span className="shrink-0 text-xs text-[#66625e]">
                  {t("landing.world.highscores.level", { level: entry.level })}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="p-[1.125rem] text-sm leading-relaxed text-[#8a8681]">
            {world.status === "loading"
              ? t("common.loading")
              : t("landing.world.highscores.empty")}
          </p>
        )}
        <div className="border-t border-white/5 px-[1.125rem] py-2.5 text-right">
          <Link
            href="/highscores"
            className="text-xs tracking-[0.14em] text-[#66625e] uppercase transition-colors hover:text-ui-text-bright"
          >
            {t("landing.world.highscores.all")}
          </Link>
        </div>
      </section>

      <section className="portal-box overflow-hidden">
        <h2 className="portal-box-header">
          <span className="portal-box-title">{t("landing.world.boosted.title")}</span>
        </h2>
        <dl>
          <div className="flex items-baseline justify-between gap-4 px-[1.125rem] py-3">
            <dt className="text-xs tracking-wide text-[#66625e] uppercase">
              {t("landing.world.boosted.creature")}
            </dt>
            <dd className="text-right font-display text-sm font-semibold text-[#e4e1da]">
              {data?.boosted.creature?.name ?? "—"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-white/5 px-[1.125rem] py-3">
            <dt className="text-xs tracking-wide text-[#66625e] uppercase">
              {t("landing.world.boosted.boss")}
            </dt>
            <dd className="text-right font-display text-sm font-semibold text-[#e4e1da]">
              {data?.boosted.boss?.name ?? "—"}
            </dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
