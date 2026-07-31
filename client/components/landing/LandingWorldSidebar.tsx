"use client";

import Link from "next/link";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLandingWorldData } from "./useLandingWorldData";

export function LandingWorldSidebar() {
  const { t } = useAppTranslation();
  const world = useLandingWorldData();
  const data = world.data;

  return (
    <aside className="order-3 grid gap-4 md:col-span-2 md:grid-cols-3 xl:col-span-1 xl:grid-cols-1">
      <section
        id="world-status"
        aria-live="polite"
        className="ui-panel-frame relative scroll-mt-24 overflow-hidden"
      >
        <h2 className="border-b border-ui-stone-light/15 bg-black/35 px-4 py-3 font-display text-xs font-bold tracking-widest text-ui-text-bright uppercase">
          {t("landing.world.status.title")}
        </h2>
        <div className="flex items-center gap-4 p-4">
          <span
            className={`relative flex size-12 shrink-0 items-center justify-center rounded-full border ${
              data
                ? "border-ui-success/50 bg-ui-success/10"
                : "border-ui-stone-light/25 bg-black/25"
            }`}
          >
            <span
              className={`size-3 rounded-full ${
                data
                  ? "bg-ui-success shadow-[0_0_16px_rgba(97,119,88,0.8)]"
                  : "bg-ui-muted"
              }`}
            />
          </span>
          <div>
            <p className="font-display text-sm font-bold tracking-wider text-ui-text-bright uppercase">
              {data
                ? t("landing.world.status.online")
                : world.status === "loading"
                  ? t("common.loading")
                  : t("landing.world.status.unknown")}
            </p>
            <p className="mt-1 text-sm text-ui-muted">
              {data
                ? t("landing.world.status.players", {
                    count: data.playersOnline,
                  })
                : world.status === "loading"
                  ? t("common.loading")
                  : t("landing.world.unavailable")}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 border-t border-ui-stone-light/15 bg-black/20">
          <div className="border-r border-ui-stone-light/15 p-3">
            <dt className="text-xs tracking-wide text-ui-muted uppercase">
              {t("landing.world.status.world")}
            </dt>
            <dd className="mt-1 text-sm font-medium text-ui-text-bright">
              Mantus
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

      <section
        id="highscores"
        className="ui-panel-frame relative scroll-mt-24 overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-ui-stone-light/15 bg-black/35 px-4 py-3">
          <h2 className="font-display text-xs font-bold tracking-widest text-ui-text-bright uppercase">
            {t("landing.world.highscores.title")}
          </h2>
          <span className="text-xs text-ui-muted">
            {t("landing.world.highscores.experience")}
          </span>
        </div>
        {data?.highscores.length ? (
          <ol className="divide-y divide-ui-stone-light/10">
            {data.highscores.map((entry) => (
              <li key={entry.name} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-ui-gold/25 bg-black/30 font-display text-xs font-bold text-ui-gold">
                  {entry.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/characters/${encodeURIComponent(entry.name)}`}
                    className="block truncate text-sm font-medium text-ui-text-bright hover:text-ui-accent-light"
                  >
                    {entry.name}
                  </Link>
                  <span className="block truncate text-xs text-ui-muted">
                    {entry.vocation}
                  </span>
                </span>
                <span className="text-xs font-medium text-ui-text">
                  {t("landing.world.highscores.level", {
                    level: entry.level,
                  })}
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
      </section>

      <section className="ui-panel-frame relative overflow-hidden">
        <h2 className="border-b border-ui-stone-light/15 bg-black/35 px-4 py-3 font-display text-xs font-bold tracking-widest text-ui-text-bright uppercase">
          {t("landing.world.boosted.title")}
        </h2>
        <dl className="divide-y divide-ui-stone-light/10">
          <div className="p-4">
            <dt className="text-xs tracking-wide text-ui-muted uppercase">
              {t("landing.world.boosted.creature")}
            </dt>
            <dd className="mt-1 font-display text-sm font-semibold text-ui-text-bright">
              {data?.boosted.creature?.name ??
                t("landing.world.boosted.awaiting")}
            </dd>
          </div>
          <div className="p-4">
            <dt className="text-xs tracking-wide text-ui-muted uppercase">
              {t("landing.world.boosted.boss")}
            </dt>
            <dd className="mt-1 font-display text-sm font-semibold text-ui-text-bright">
              {data?.boosted.boss?.name ?? t("landing.world.boosted.awaiting")}
            </dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
