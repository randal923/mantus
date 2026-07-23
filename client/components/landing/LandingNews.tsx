"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LandingNewsRow } from "./LandingNewsRow";

const NEWS_ITEMS = ["gatesOpen", "marketAndHouses", "roadToWar"] as const;

export function LandingNews() {
  const { t } = useAppTranslation();

  return (
    <section
      id="news"
      className="mx-auto w-full max-w-4xl scroll-mt-28 px-4 py-14 sm:px-6"
    >
      <div className="ui-panel-frame overflow-hidden">
        <div className="flex flex-col gap-1 border-b border-ui-stone-light/20 bg-black/35 px-5 py-3.5">
          <h2 className="font-display text-base font-bold tracking-widest text-ui-text-bright uppercase">
            {t("landing.news.title")}
          </h2>
          <p className="text-sm text-ui-muted">{t("landing.news.subtitle")}</p>
        </div>
        <div className="flex flex-col">
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
  );
}
