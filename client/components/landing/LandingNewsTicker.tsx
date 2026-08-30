"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";

const TICKER_ITEMS = ["gatesOpen"] as const;

export function LandingNewsTicker() {
  const { t } = useAppTranslation();

  return (
    <section className="portal-box overflow-hidden">
      <h2 className="portal-box-header font-display text-sm font-bold tracking-widest uppercase">
        <span
          aria-hidden
          className="size-1.5 rotate-45 border border-ui-stone-light/60 bg-ui-stone-light/15"
        />
        <span className="portal-box-title">{t("landing.news.ticker")}</span>
      </h2>
      <ul className="relative z-[2] grid gap-1.5 p-2.5">
        {TICKER_ITEMS.map((item) => (
          <li
            key={item}
            className="flex items-center gap-3 rounded-sm border border-black/60 bg-black/30 px-2.5 py-1.5 text-sm shadow-[inset_0_1px_0_rgba(226,226,219,0.05)]"
          >
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-[2px] border border-ui-stone-light/25 bg-black/40"
            >
              <span className="size-1.5 rotate-45 bg-ui-gold/60" />
            </span>
            <time className="shrink-0 text-xs text-ui-muted">
              {t(`landing.news.items.${item}.date`)}
            </time>
            <span className="min-w-0 truncate text-ui-text">
              {t(`landing.news.items.${item}.title`)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
