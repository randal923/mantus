"use client";

import Image from "next/image";
import { useAppTranslation } from "../../i18n/useAppTranslation";

export function LandingFeaturedArticle() {
  const { t } = useAppTranslation();

  return (
    <article id="latest-news" className="portal-box scroll-mt-24 overflow-hidden">
      <header className="portal-box-header">
        <time className="shrink-0 text-xs font-medium text-ui-muted">
          {t("landing.featured.date")}
        </time>
        <span aria-hidden className="text-ui-muted/60">
          —
        </span>
        <h3 className="font-display text-sm font-bold leading-6 tracking-wide uppercase">
          {t("landing.featured.title")}
        </h3>
      </header>
      <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center">
        <p className="text-sm leading-7 text-ui-text">
          {t("landing.featured.description")}
        </p>
        <div className="relative aspect-[4/3] overflow-hidden rounded-sm border border-ui-stone-light/20">
          <Image
            src="/images/landing/astral-vault.webp"
            alt={t("landing.featured.imageAlt")}
            fill
            sizes="(min-width: 640px) 208px, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </article>
  );
}
