"use client";

import Link from "next/link";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PublicAuthAction } from "../public-site/PublicAuthAction";
import { useLandingWorldData } from "./useLandingWorldData";

export function LandingWorldSidebar() {
  const { t } = useAppTranslation();
  const world = useLandingWorldData();
  const data = world.data;

  return (
    <aside className="order-3 grid gap-4 self-start md:col-span-2 md:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
      <section className="portal-box overflow-hidden">
        <h2 className="portal-box-header font-display text-sm font-bold tracking-widest uppercase">
          <span
            aria-hidden
            className="size-1.5 rotate-45 border border-ui-stone-light/60 bg-ui-stone-light/15"
          />
          <span className="portal-box-title">{t("landing.menu.account.title")}</span>
        </h2>
        <div className="relative z-[2] p-4">
          <PublicAuthAction className="w-full justify-center" />
          <p className="mt-3 text-center text-xs leading-relaxed text-ui-muted">
            {t("landing.menu.playNote")}
          </p>
        </div>
      </section>

      <section
        id="world-status"
        aria-live="polite"
        className="portal-box scroll-mt-24 overflow-hidden"
      >
        <h2 className="portal-box-header font-display text-sm font-bold tracking-widest uppercase">
          <span
            aria-hidden
            className="size-1.5 rotate-45 border border-ui-stone-light/60 bg-ui-stone-light/15"
          />
          <span className="portal-box-title">{t("landing.world.status.title")}</span>
        </h2>
        <div className="flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden
            className={`size-2.5 shrink-0 rounded-full ${
              data
                ? "bg-ui-success-light shadow-[0_0_12px_rgba(143,175,127,0.9)]"
                : "bg-ui-muted"
            }`}
          />
          <p className="text-sm text-ui-text">
            {data
              ? t("landing.world.status.players", {
                  count: data.playersOnline,
                })
              : world.status === "loading"
                ? t("common.loading")
                : t("landing.world.unavailable")}
          </p>
        </div>
        <dl className="grid grid-cols-2 border-t border-ui-stone-light/15 bg-black/20">
          <div className="border-r border-ui-stone-light/15 p-3">
            <dt className="text-xs tracking-wide text-ui-muted uppercase">
              {t("landing.world.status.world")}
            </dt>
            <dd className="mt-1 text-sm font-medium text-ui-text-bright">
              {data?.worldName ?? "Mantus"}
            </dd>
          </div>
          <div className="p-3">
            <dt className="text-xs tracking-wide text-ui-muted uppercase">
              {t("landing.world.status.type")}
            </dt>
            <dd className="mt-1 text-sm font-medium text-ui-text-bright">
              Open PvP
            </dd>
          </div>
        </dl>
      </section>

      <section id="highscores" className="portal-box scroll-mt-24 overflow-hidden">
        <h2 className="portal-box-header font-display text-sm font-bold tracking-widest uppercase">
          <span
            aria-hidden
            className="size-1.5 rotate-45 border border-ui-stone-light/60 bg-ui-stone-light/15"
          />
          <span className="portal-box-title">{t("landing.world.highscores.title")}</span>
        </h2>
        {data?.highscores.length ? (
          <ol className="divide-y divide-ui-stone-light/10">
            {data.highscores.map((entry) => (
              <li key={entry.name} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-4 shrink-0 font-display text-xs font-bold text-ui-gold">
                  {entry.rank}
                </span>
                <Link
                  href={`/characters/${encodeURIComponent(entry.name)}`}
                  className="relative z-[2] min-w-0 flex-1 truncate text-sm font-medium text-ui-text-bright hover:text-ui-accent-light"
                >
                  {entry.name}
                </Link>
                <span className="shrink-0 text-xs font-medium text-ui-muted">
                  {t("landing.world.highscores.level", { level: entry.level })}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="p-4 text-sm leading-relaxed text-ui-muted">
            {world.status === "loading"
              ? t("common.loading")
              : t("landing.world.highscores.empty")}
          </p>
        )}
        <div className="border-t border-ui-stone-light/15 bg-black/20 px-4 py-2 text-right">
          <Link
            href="/highscores"
            className="relative z-[2] text-xs text-ui-muted transition-colors hover:text-ui-text-bright"
          >
            {t("landing.world.highscores.all")}
          </Link>
        </div>
      </section>

      <section className="portal-box overflow-hidden">
        <h2 className="portal-box-header font-display text-sm font-bold tracking-widest uppercase">
          <span
            aria-hidden
            className="size-1.5 rotate-45 border border-ui-stone-light/60 bg-ui-stone-light/15"
          />
          <span className="portal-box-title">{t("landing.world.boosted.title")}</span>
        </h2>
        <dl className="divide-y divide-ui-stone-light/10">
          <div className="flex items-baseline justify-between gap-4 px-4 py-3">
            <dt className="text-xs tracking-wide text-ui-muted uppercase">
              {t("landing.world.boosted.creature")}
            </dt>
            <dd className="text-right font-display text-sm font-semibold text-ui-text-bright">
              {data?.boosted.creature?.name ?? "—"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 px-4 py-3">
            <dt className="text-xs tracking-wide text-ui-muted uppercase">
              {t("landing.world.boosted.boss")}
            </dt>
            <dd className="text-right font-display text-sm font-semibold text-ui-text-bright">
              {data?.boosted.boss?.name ?? "—"}
            </dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
