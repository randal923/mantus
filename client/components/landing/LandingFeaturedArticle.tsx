"use client";

import Image from "next/image";
import { useAppTranslation } from "../../i18n/useAppTranslation";

export function LandingFeaturedArticle() {
  const { t } = useAppTranslation();

  return (
    <article
      id="latest-news"
      className="portal-box portal-box-warm scroll-mt-28 p-7"
    >
      <p className="mb-3 text-[0.6875rem] tracking-[0.24em] text-[#a8524c] uppercase">
        {t("landing.featured.date")}
      </p>
      <h3 className="mb-3 font-display text-2xl font-semibold tracking-wide text-[#f2ece2]">
        {t("landing.featured.title")}
      </h3>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center">
        <p className="text-[0.9375rem] leading-7 text-pretty text-[#918d87]">
          {t("landing.featured.description")}
        </p>
        <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-white/10">
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
