"use client";

import type { ItemDisplayRarity, ItemTooltipData } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { WIKI_RARITY_GUIDE } from "../../lib/wiki/wikiRarityGuide";
import { TIBIA_TOOLTIP_ITEMS } from "../inventory/tibiaTooltipItems";
import { AffixGuideTable } from "./AffixGuideTable";
import { PublicSiteLayout } from "./PublicSiteLayout";
import { RarityGuideCard } from "./RarityGuideCard";

const RARITY_EXAMPLES: Readonly<Record<ItemDisplayRarity, ItemTooltipData>> = {
  common: TIBIA_TOOLTIP_ITEMS.armor,
  uncommon: TIBIA_TOOLTIP_ITEMS.uncommonWand,
  rare: TIBIA_TOOLTIP_ITEMS.rareSword,
  epic: TIBIA_TOOLTIP_ITEMS.epicArmor,
  legendary: TIBIA_TOOLTIP_ITEMS.legendaryHelmet,
};

export function ItemsWikiPage() {
  const { t } = useAppTranslation();

  return (
    <PublicSiteLayout>
      <div className="grid gap-5">
        <header className="portal-box portal-box-warm overflow-hidden p-5 sm:p-6">
          <p className="font-display text-[0.6875rem] font-normal tracking-[0.24em] text-[#a8524c] uppercase">
            {t("websiteWikiItems.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-wide text-[#f2ece2]">
            {t("websiteWikiItems.title")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-ui-muted">
            {t("websiteWikiItems.description")}
          </p>
        </header>

        <section aria-labelledby="rarity-grades" className="grid gap-4">
          <div className="px-1">
            <h2
              id="rarity-grades"
              className="font-display text-xl font-semibold tracking-wide text-[#f2ece2]"
            >
              {t("websiteWikiItems.rarities.title")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-ui-muted">
              {t("websiteWikiItems.rarities.description")}
            </p>
          </div>
          {/* Common is the ungraded baseline, so it lives outside the
              rolled-grade guide that also drives the affix table columns. */}
          <RarityGuideCard
            rarity="common"
            affixCount={0}
            example={RARITY_EXAMPLES.common}
          />
          {WIKI_RARITY_GUIDE.map((grade) => (
            <RarityGuideCard
              key={grade.rarity}
              rarity={grade.rarity}
              affixCount={grade.affixCount}
              valueMultiplier={grade.valueMultiplier}
              example={RARITY_EXAMPLES[grade.rarity]}
            />
          ))}
        </section>

        <AffixGuideTable />
      </div>
    </PublicSiteLayout>
  );
}
