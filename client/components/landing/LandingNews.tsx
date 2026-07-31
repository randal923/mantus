"use client";

import Image from "next/image";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LandingNewsRow } from "./LandingNewsRow";

const NEWS_ITEMS = ["gatesOpen", "marketAndHouses", "roadToWar"] as const;

export function LandingNews() {
  const { t } = useAppTranslation();

  return (
    <div className="flex flex-col gap-5">
      <section
        id="latest-news"
        className="ui-panel-frame relative scroll-mt-24 overflow-hidden"
      >
        <div className="flex items-center justify-between gap-4 border-b border-ui-stone-light/20 bg-black/35 px-5 py-3.5">
          <div>
            <p className="text-xs font-medium tracking-widest text-ui-accent-light uppercase">
              {t("landing.news.kicker")}
            </p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-widest text-ui-text-bright uppercase">
              {t("landing.news.title")}
            </h2>
          </div>
          <span className="hidden border border-ui-stone-light/20 bg-black/25 px-3 py-1 text-xs tracking-wide text-ui-muted uppercase sm:block">
            {t("landing.news.updated")}
          </span>
        </div>

        <div className="grid gap-4 p-3 sm:p-4">
          <article
            id="featured-story"
            className="scroll-mt-24 overflow-hidden border border-ui-stone-light/20 bg-black/20"
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-accent/45 bg-[linear-gradient(90deg,rgba(91,16,12,0.96),rgba(55,10,8,0.72))] px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                <time className="shrink-0 text-xs font-medium text-ui-text">
                  {t("landing.featured.date")}
                </time>
                <span aria-hidden className="text-ui-muted">
                  —
                </span>
                <h3 className="font-display text-base font-bold leading-6 tracking-wide text-ui-text-bright uppercase">
                  {t("landing.featured.title")}
                </h3>
              </div>
              <span className="border border-ui-accent-light/35 bg-black/25 px-2 py-0.5 font-display text-xs font-bold tracking-wider text-ui-accent-light uppercase">
                {t("landing.featured.label")}
              </span>
            </header>
            <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center sm:p-6">
              <div className="sm:order-2">
                <div className="relative aspect-[4/3] overflow-hidden border border-ui-stone-light/20">
                  <Image
                    src="/images/landing/astral-vault.webp"
                    alt={t("landing.featured.imageAlt")}
                    fill
                    sizes="(min-width: 640px) 224px, 100vw"
                    className="object-cover"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-linear-to-t from-black/55 via-transparent to-transparent"
                  />
                </div>
              </div>
              <div className="sm:order-1">
                <p className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
                  {t("landing.featured.category")}
                </p>
                <p className="mt-3 text-sm leading-7 text-ui-text">
                  {t("landing.featured.description")}
                </p>
              </div>
            </div>
          </article>

          <div id="news-archive" className="grid scroll-mt-24 gap-4">
          {NEWS_ITEMS.map((item) => (
            <LandingNewsRow
              key={item}
              tag={t(`landing.news.items.${item}.tag`)}
              date={t(`landing.news.items.${item}.date`)}
              title={t(`landing.news.items.${item}.title`)}
              excerpt={t(`landing.news.items.${item}.excerpt`)}
            />
          ))}
          </div>
        </div>
      </section>

      <section
        id="world-overview"
        className="ui-panel-frame relative scroll-mt-24 overflow-hidden"
      >
        <div className="grid sm:grid-cols-[minmax(0,1fr)_2fr]">
          <div className="relative min-h-56 sm:min-h-full">
            <Image
              src="/images/landing/frontier-road.webp"
              alt={t("landing.overview.imageAlt")}
              fill
              sizes="(min-width: 640px) 240px, 100vw"
              className="object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-linear-to-r from-transparent to-ui-panel-deep/70"
            />
          </div>
          <div className="flex flex-col justify-center gap-4 p-6">
            <p className="text-xs font-medium tracking-widest text-ui-accent-light uppercase">
              {t("landing.overview.kicker")}
            </p>
            <h2 className="font-display text-xl font-bold tracking-wide text-ui-text-bright uppercase">
              {t("landing.overview.title")}
            </h2>
            <p className="text-sm leading-7 text-ui-text">
              {t("landing.overview.description")}
            </p>
            <div className="grid gap-3 pt-2 sm:grid-cols-3">
              {(["world", "vocations", "economy"] as const).map((stat) => (
                <div
                  key={stat}
                  className="border-l border-ui-accent/50 pl-3 text-xs leading-relaxed tracking-wide text-ui-muted uppercase"
                >
                  {t(`landing.hero.stats.${stat}`)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
