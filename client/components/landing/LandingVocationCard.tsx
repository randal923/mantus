"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { OutfitPortrait } from "../characters/OutfitPortrait";
import { LandingImage } from "./LandingImage";
import type { LandingVocationShowcase } from "./landingVocationShowcase";

interface LandingVocationCardProps {
  showcase: LandingVocationShowcase;
  className?: string;
}

export function LandingVocationCard({
  showcase,
  className,
}: LandingVocationCardProps) {
  const { t } = useAppTranslation();
  const name = t(`vocations.${showcase.vocation}.name`);
  const slug = showcase.vocation.toLowerCase();

  return (
    <article
      className={`relative isolate flex min-h-[22rem] flex-col overflow-hidden rounded-sm border border-ui-gold/35 bg-ui-panel-deep p-1 ${className ?? ""}`}
    >
      <span aria-hidden className="absolute -top-1 -left-1 z-10 size-2 rotate-45 bg-ui-gold/70" />
      <span aria-hidden className="absolute -top-1 -right-1 z-10 size-2 rotate-45 bg-ui-gold/70" />
      <span aria-hidden className="absolute -bottom-1 -left-1 z-10 size-2 rotate-45 bg-ui-gold/70" />
      <span aria-hidden className="absolute -right-1 -bottom-1 z-10 size-2 rotate-45 bg-ui-gold/70" />
      <div className="relative flex flex-1 flex-col overflow-hidden rounded-sm border border-ui-gold/20">
        <LandingImage
          src={`/images/landing/vocation-${slug}.webp`}
          alt={name}
          className="absolute inset-0 -z-20 size-full rounded-none border-0"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-linear-to-b from-black/20 via-ui-panel-deep/60 to-ui-panel-deep/95"
        />
        <div className="flex flex-1 items-center justify-center pt-6">
          <OutfitPortrait outfit={showcase.outfit} scale={2.5} />
        </div>
        <div className="flex flex-col items-center gap-3 px-4 pt-2 pb-6 text-center">
          <h3 className="font-display text-sm font-bold tracking-widest text-ui-text-bright uppercase">
            {name}
          </h3>
          <div aria-hidden className="flex w-full items-center justify-center gap-2">
            <span className="ui-divider h-px flex-1" />
            <span className="size-1.5 shrink-0 rotate-45 bg-ui-gold/70" />
            <span className="ui-divider h-px flex-1" />
          </div>
          <p className="text-sm leading-relaxed text-ui-text">
            {t(`vocations.${showcase.vocation}.description`)}
          </p>
        </div>
      </div>
    </article>
  );
}
