"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ItemCell } from "../inventory/ItemCell";
import { TIBIA_TOOLTIP_ITEMS } from "../inventory/tibiaTooltipItems";

const PICK_UP_LIST = [
  { key: "uncommonWand", item: TIBIA_TOOLTIP_ITEMS.uncommonWand },
  { key: "rareSword", item: TIBIA_TOOLTIP_ITEMS.rareSword },
  { key: "epicArmor", item: TIBIA_TOOLTIP_ITEMS.epicArmor },
  { key: "legendaryHelmet", item: TIBIA_TOOLTIP_ITEMS.legendaryHelmet },
  { key: "amulet", item: TIBIA_TOOLTIP_ITEMS.amulet },
] as const;

/** The loot filter's pick-up list, drawn with the game's own item cells. */
export function LandingNewsLootFilterShowcase() {
  const { t } = useAppTranslation();

  return (
    <div className="rounded-lg border border-ui-stone-light/15 bg-black/20 p-4 font-tibia">
      <div className="flex items-center gap-2 text-sm text-ui-text">
        <span className="inline-flex size-4 items-center justify-center rounded-sm border border-ui-gold/60 bg-ui-gold/15 text-[10px] text-ui-gold">
          ✓
        </span>
        {t("lootFilter.enabled")}
      </div>
      <p className="mt-1 text-xs text-ui-muted">
        {t("lootFilter.enabledDescription")}
      </p>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <h5 className="font-display text-sm tracking-[0.1em] text-ui-gold uppercase">
          {t("lootFilter.selected")}
        </h5>
        <span className="text-xs font-semibold tabular-nums text-ui-muted">
          {PICK_UP_LIST.length}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {PICK_UP_LIST.map(({ key, item }) => (
          <ItemCell
            key={key}
            spriteId={item.spriteId}
            rarity={item.rarity}
            tooltip={item}
            pressed
            marker={<span className="text-ui-success-light">✓</span>}
            label={t("lootFilter.removeItem", { name: item.name })}
          />
        ))}
      </div>
    </div>
  );
}
