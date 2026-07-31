"use client";

import type {
  CharacterOutfit,
  CharacterVocation,
  StarterVocation,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { OutfitPortrait } from "../characters/OutfitPortrait";

interface VocationGuideCardProps {
  readonly outfit: CharacterOutfit;
  readonly promotion: CharacterVocation;
  readonly vocation: StarterVocation;
}

export function VocationGuideCard({
  outfit,
  promotion,
  vocation,
}: VocationGuideCardProps) {
  const { t } = useAppTranslation();

  return (
    <article
      id={`vocation-${vocation.toLowerCase()}`}
      className="ui-panel-frame relative scroll-mt-24 overflow-hidden"
    >
      <div className="grid sm:grid-cols-[9rem_minmax(0,1fr)]">
        <div className="flex min-h-40 items-center justify-center border-b border-ui-stone-light/15 bg-[radial-gradient(circle_at_center,rgba(143,30,22,0.22),rgba(0,0,0,0.38)_68%)] p-5 sm:border-r sm:border-b-0">
          <OutfitPortrait outfit={outfit} fit={96} />
        </div>
        <div className="min-w-0 p-5 sm:p-6">
          <p className="font-display text-xs font-bold tracking-widest text-ui-accent-light uppercase">
            {t(`websiteVocations.entries.${vocation}.role`)}
          </p>
          <h2 className="mt-2 font-display text-xl font-bold tracking-wide text-ui-text-bright uppercase">
            {t(`vocations.${vocation}.name`)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-ui-muted">
            {t(`vocations.${vocation}.description`)}
          </p>
        </div>
      </div>

      <dl className="divide-y divide-ui-stone-light/10 border-t border-ui-stone-light/15">
        <div className="grid gap-1 px-5 py-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4 sm:px-6">
          <dt className="font-display text-xs font-bold tracking-wide text-ui-gold uppercase">
            {t("websiteVocations.playstyle")}
          </dt>
          <dd className="text-sm leading-6 text-ui-text">
            {t(`websiteVocations.entries.${vocation}.playstyle`)}
          </dd>
        </div>
        <div className="grid gap-1 bg-white/2 px-5 py-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4 sm:px-6">
          <dt className="font-display text-xs font-bold tracking-wide text-ui-gold uppercase">
            {t("websiteVocations.strength")}
          </dt>
          <dd className="text-sm leading-6 text-ui-text">
            {t(`websiteVocations.entries.${vocation}.strength`)}
          </dd>
        </div>
        <div className="grid gap-1 px-5 py-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4 sm:px-6">
          <dt className="font-display text-xs font-bold tracking-wide text-ui-gold uppercase">
            {t("websiteVocations.tradeoff")}
          </dt>
          <dd className="text-sm leading-6 text-ui-text">
            {t(`websiteVocations.entries.${vocation}.tradeoff`)}
          </dd>
        </div>
        <div className="grid gap-1 bg-black/20 px-5 py-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center sm:gap-4 sm:px-6">
          <dt className="font-display text-xs font-bold tracking-wide text-ui-gold uppercase">
            {t("websiteVocations.promotion")}
          </dt>
          <dd className="font-display text-sm font-bold tracking-wide text-ui-text-bright uppercase">
            {t(`vocations.${promotion}.name`)}
          </dd>
        </div>
      </dl>
    </article>
  );
}
