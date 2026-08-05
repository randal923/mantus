"use client";

import type { ItemRarity, ItemTooltipData } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ItemTooltip } from "../inventory/ItemTooltip";

interface RarityGuideCardProps {
  readonly rarity: ItemRarity;
  readonly affixCount: number;
  readonly valueMultiplier: number;
  readonly example: ItemTooltipData;
}

/**
 * Tailwind needs literal class strings, so each rarity carries its color
 * (same pattern as ItemTooltip).
 */
const RARITY_TEXT = {
  uncommon: "text-rarity-uncommon",
  rare: "text-rarity-rare",
  epic: "text-rarity-epic",
  legendary: "text-rarity-legendary",
} as const;

export function RarityGuideCard({
  rarity,
  affixCount,
  valueMultiplier,
  example,
}: RarityGuideCardProps) {
  const { t } = useAppTranslation();

  return (
    <article className="ui-panel-frame relative overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 p-5 sm:p-6">
          <h3
            className={`font-display text-lg font-bold tracking-wide uppercase ${RARITY_TEXT[rarity]}`}
          >
            {t(`itemTooltip.rarity.${rarity}`)}
          </h3>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="grid gap-1">
              <dt className="font-display text-xs font-bold tracking-wide text-ui-gold uppercase">
                {t("websiteWikiItems.rarities.affixCountLabel")}
              </dt>
              <dd className="text-ui-text tabular-nums">{affixCount}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="font-display text-xs font-bold tracking-wide text-ui-gold uppercase">
                {t("websiteWikiItems.rarities.powerLabel")}
              </dt>
              <dd className="text-ui-text tabular-nums">
                ×{valueMultiplier}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex items-center justify-center border-t border-ui-stone-light/15 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),rgba(0,0,0,0.4)_72%)] p-4 lg:border-t-0 lg:border-l">
          <ItemTooltip item={example} />
        </div>
      </div>
    </article>
  );
}
