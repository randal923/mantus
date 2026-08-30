"use client";

import Image from "next/image";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { LandingNewsArticleData } from "./landingNewsArticles";

/** Shared renderer for one news article: date eyebrow, title, short paragraphs, optional art. */
export function LandingNewsArticle({
  article,
}: {
  article: LandingNewsArticleData;
}) {
  const { t } = useAppTranslation();
  const paragraphs = t(`landing.news.items.${article.id}.paragraphs`, {
    returnObjects: true,
  });
  const body = Array.isArray(paragraphs) ? (paragraphs as string[]) : [];

  return (
    <article className="portal-box portal-box-warm p-7">
      <p className="mb-3 text-[0.6875rem] tracking-[0.24em] text-[#a8524c] uppercase">
        {t(`landing.news.items.${article.id}.date`)}
      </p>
      <h3 className="mb-4 font-display text-2xl font-semibold tracking-wide text-[#f2ece2]">
        {t(`landing.news.items.${article.id}.title`)}
      </h3>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center">
        <div className="flex flex-col gap-4 text-[0.9375rem] leading-7 text-pretty text-[#918d87]">
          {body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        {article.image ? (
          <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-white/10">
            <Image
              src={article.image.src}
              alt={t(`landing.news.items.${article.id}.imageAlt`)}
              fill
              sizes="(min-width: 640px) 208px, 100vw"
              className="object-cover"
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}
