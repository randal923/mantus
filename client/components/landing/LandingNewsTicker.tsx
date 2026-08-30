"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LANDING_NEWS_ARTICLES } from "./landingNewsArticles";

/** Compact news rows above the full articles. */
export function LandingNewsTicker() {
  const { t } = useAppTranslation();

  return (
    <ul className="flex flex-col gap-2.5">
      {LANDING_NEWS_ARTICLES.map((article) => (
        <li
          key={article.id}
          className="portal-box grid grid-cols-[auto_1fr] items-center gap-4 px-5 py-4"
        >
          <time className="text-xs whitespace-nowrap text-[#66625e]">
            {t(`landing.news.items.${article.id}.date`)}
          </time>
          <span className="min-w-0 truncate text-[0.9375rem] text-[#b8b3ac]">
            {t(`landing.news.items.${article.id}.title`)}
          </span>
        </li>
      ))}
    </ul>
  );
}
