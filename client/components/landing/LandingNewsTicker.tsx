"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";

const TICKER_ITEMS = ["gatesOpen"] as const;

/** Compact news rows below the featured article. */
export function LandingNewsTicker() {
  const { t } = useAppTranslation();

  return (
    <ul className="flex flex-col gap-2.5">
      {TICKER_ITEMS.map((item) => (
        <li
          key={item}
          className="portal-box grid grid-cols-[auto_1fr] items-center gap-4 px-5 py-4"
        >
          <time className="text-xs whitespace-nowrap text-[#66625e]">
            {t(`landing.news.items.${item}.date`)}
          </time>
          <span className="min-w-0 truncate text-[0.9375rem] text-[#b8b3ac]">
            {t(`landing.news.items.${item}.title`)}
          </span>
        </li>
      ))}
    </ul>
  );
}
