"use client";

import { ItemTooltip } from "../inventory/ItemTooltip";
import { TIBIA_TOOLTIP_ITEMS } from "../inventory/tibiaTooltipItems";

/** Two graded drops rendered with the game's own item tooltip. */
export function LandingNewsItemRarityShowcase() {
  return (
    <div className="flex flex-wrap justify-center gap-4 [&_[role=tooltip]]:max-w-full">
      <ItemTooltip item={TIBIA_TOOLTIP_ITEMS.rareSword} />
      <ItemTooltip item={TIBIA_TOOLTIP_ITEMS.legendaryHelmet} />
    </div>
  );
}
