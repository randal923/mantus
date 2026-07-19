"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ButtonLink } from "../ui/ButtonLink";
import { MantusLogo } from "../ui/MantusLogo";
import { LandingImage } from "./LandingImage";

const HERO_STATS = ["world", "vocations", "economy"] as const;

export function LandingHero() {
  const { t } = useAppTranslation();

  return (
    <section className="relative isolate overflow-hidden">
      <LandingImage
        src="/images/landing/hero-keyart.webp"
        alt={t("landing.hero.artAlt")}
        className="absolute inset-0 -z-20 size-full rounded-none border-0 opacity-45"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-b from-ui-panel-deep/70 via-ui-panel-deep/35 to-ui-panel-deep"
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-4 pt-24 pb-16 text-center sm:px-6 sm:pt-32 sm:pb-20">
        <MantusLogo />
        <div className="flex max-w-2xl flex-col gap-4">
          <h1 className="font-display text-2xl font-bold tracking-wide text-ui-text-bright uppercase sm:text-3xl">
            {t("landing.hero.tagline")}
          </h1>
          <p className="text-sm leading-relaxed text-ui-text sm:text-base">
            {t("landing.hero.subtitle")}
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/play" variant="primary" className="h-12 px-8 text-base">
              {t("landing.hero.cta")}
            </ButtonLink>
            <ButtonLink href="#features" className="h-12 px-6">
              {t("landing.hero.ctaSecondary")}
            </ButtonLink>
          </div>
          <p className="text-xs tracking-wide text-ui-muted uppercase">
            {t("landing.hero.note")}
          </p>
        </div>
        <div className="mt-4 flex w-full max-w-3xl flex-col items-stretch justify-center gap-3 sm:flex-row">
          {HERO_STATS.map((stat) => (
            <div
              key={stat}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-ui-stone-light/15 bg-black/30 px-4 py-3"
            >
              <span aria-hidden className="size-1.5 shrink-0 rotate-45 bg-ui-gold" />
              <span className="font-display text-xs font-semibold tracking-widest text-ui-text uppercase">
                {t(`landing.hero.stats.${stat}`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
