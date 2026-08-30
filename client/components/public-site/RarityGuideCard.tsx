"use client";

import type { ItemDisplayRarity, ItemTooltipData } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ItemTooltip } from "../inventory/ItemTooltip";

interface RarityGuideCardProps {
  readonly rarity: ItemDisplayRarity;
  readonly affixCount: number;
  /** Absent on common, which never scales an affix. */
  readonly valueMultiplier?: number;
  readonly example: ItemTooltipData;
}

/**
 * Tailwind needs literal class strings, so each rarity carries its color
 * (same pattern as ItemTooltip).
 */
const RARITY_TEXT = {
  common: "text-rarity-common",
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
    <article className="portal-box overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 p-5 sm:p-6">
          <h3
            className={`font-display text-lg font-bold tracking-wide uppercase ${RARITY_TEXT[rarity]}`}
          >
            {t(`itemTooltip.rarity.${rarity}`)}
          </h3>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="grid gap-1">
              <dt className="font-display text-[0.6875rem] font-normal tracking-[0.18em] text-[#6e6a66] uppercase">
                {t("websiteWikiItems.rarities.affixCountLabel")}
              </dt>
              <dd className="text-ui-text tabular-nums">{affixCount}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="font-display text-[0.6875rem] font-normal tracking-[0.18em] text-[#6e6a66] uppercase">
                {t("websiteWikiItems.rarities.powerLabel")}
              </dt>
              <dd className="text-ui-text tabular-nums">
                {valueMultiplier === undefined ? "—" : `×${valueMultiplier}`}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex items-center justify-center border-t border-white/5 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),rgba(0,0,0,0.4)_72%)] p-4 lg:border-t-0 lg:border-l">
          <ItemTooltip item={example} />
        </div>
      </div>
    </article>
  );
}
