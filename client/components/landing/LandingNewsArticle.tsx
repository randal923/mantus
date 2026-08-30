"use client";

import type { ComponentType } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LandingNewsArticleImage } from "./LandingNewsArticleImage";
import { LandingNewsHuntFinderShowcase } from "./LandingNewsHuntFinderShowcase";
import { LandingNewsHuntingBotShowcase } from "./LandingNewsHuntingBotShowcase";
import { LandingNewsItemRarityShowcase } from "./LandingNewsItemRarityShowcase";
import { LandingNewsLootFilterShowcase } from "./LandingNewsLootFilterShowcase";
import type {
  LandingNewsArticleData,
  LandingNewsSectionVisual,
} from "./landingNewsArticles";

const SECTION_VISUALS: Readonly<
  Record<LandingNewsSectionVisual, ComponentType>
> = {
  itemRarity: LandingNewsItemRarityShowcase,
  lootFilter: LandingNewsLootFilterShowcase,
  huntingBot: LandingNewsHuntingBotShowcase,
  huntFinder: LandingNewsHuntFinderShowcase,
};

/** Visuals the reader is invited to operate; the rest render inert. */
const INTERACTIVE_VISUALS: ReadonlySet<LandingNewsSectionVisual> = new Set([
  "huntFinder",
  "huntingBot",
]);

/**
 * Shared renderer for one news article: date eyebrow, title, short paragraphs,
 * optional art, then titled sections — some showing inert mocks of the real
 * in-game components.
 */
export function LandingNewsArticle({
  article,
}: {
  article: LandingNewsArticleData;
}) {
  const { t } = useAppTranslation();
  const base = `landing.news.items.${article.id}`;
  const paragraphsOf = (key: string): string[] => {
    const value = t(key, { returnObjects: true });
    return Array.isArray(value) ? (value as string[]) : [];
  };

  return (
    <article className="portal-box portal-box-warm p-7">
      <p className="mb-3 text-[0.6875rem] tracking-[0.24em] text-[#a8524c] uppercase">
        {t(`${base}.date`)}
      </p>
      <h3 className="mb-4 font-display text-2xl font-semibold tracking-wide text-[#f2ece2]">
        {t(`${base}.title`)}
      </h3>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center">
        <div className="flex flex-col gap-4 text-[0.9375rem] leading-7 text-pretty text-[#918d87]">
          {paragraphsOf(`${base}.paragraphs`).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        {article.image ? (
          <LandingNewsArticleImage
            image={article.image}
            alt={t(`${base}.imageAlt`)}
          />
        ) : null}
      </div>
      {(article.sections ?? []).map((section) => {
        const Visual = section.visual
          ? SECTION_VISUALS[section.visual]
          : undefined;
        return (
          <section key={section.id} className="mt-8">
            <h4 className="mb-3 font-display text-lg font-semibold tracking-wide text-[#e8e3db]">
              {t(`${base}.sections.${section.id}.title`)}
            </h4>
            <div className="flex flex-col gap-4 text-[0.9375rem] leading-7 text-pretty text-[#918d87]">
              {paragraphsOf(`${base}.sections.${section.id}.paragraphs`).map(
                (paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ),
              )}
            </div>
            {Visual && section.visual ? (
              INTERACTIVE_VISUALS.has(section.visual) ? (
                <div className="mt-5">
                  <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-300">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                    </span>
                    {t("landing.news.interactive")}
                  </p>
                  <Visual />
                </div>
              ) : (
                /* Marketing mock: the real component, drawn but not operable. */
                <div inert className="mt-5 select-none">
                  <Visual />
                </div>
              )
            ) : null}
          </section>
        );
      })}
    </article>
  );
}
