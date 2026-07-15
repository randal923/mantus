"use client";

import type { ItemTooltipData } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { DurabilityIcon } from "./DurabilityIcon";
import { ItemAffixLine } from "./ItemAffixLine";
import { RARITY_STYLES } from "./rarityStyles";
import { SpriteIcon } from "./SpriteIcon";

const GOLD_COIN_SPRITE_ID = 7384;

interface ItemTooltipProps {
  item: ItemTooltipData;
}

/** Hover card describing one item; purely presentational, stats come from the server. */
export function ItemTooltip({ item }: ItemTooltipProps) {
  const { t } = useAppTranslation();
  const rarity = RARITY_STYLES[item.rarity];

  return (
    <div
      role="tooltip"
      aria-label={item.name}
      className={`relative isolate w-80 overflow-hidden rounded-lg border ${rarity.border} bg-ui-panel-deep/95 p-4 font-tibia text-ui-text shadow-[0_14px_40px_rgba(0,0,0,0.65)]`}
    >
      <div
        aria-hidden
        className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.05] mix-blend-soft-light"
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-6 top-0 -z-10 h-24 bg-radial ${rarity.glow} to-transparent blur-xl`}
      />

      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className={`font-display text-base font-semibold tracking-[0.08em] uppercase ${rarity.name} [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]`}
          >
            {item.name}
          </h3>
          <p className={`mt-1 text-xs ${rarity.typeLine}`}>{item.typeLine}</p>
        </div>
        <SpriteIcon
          spriteId={item.spriteId}
          scale={2}
          className="shrink-0 drop-shadow-[0_4px_6px_rgba(0,0,0,0.7)]"
        />
      </header>

      <div aria-hidden className="ui-divider my-3" />

      {item.primaryStat && (
        <p className="text-lg font-semibold text-ui-text-bright">
          {item.primaryStat}
        </p>
      )}

      {item.affixes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {item.affixes.map((affix) => (
            <ItemAffixLine key={affix.text} affix={affix} />
          ))}
        </ul>
      )}

      {(item.requiredLevel !== undefined || item.accountBound) && (
        <div className="mt-3 text-right text-sm">
          {item.requiredLevel !== undefined && (
            <p className="text-ui-text-bright">
              {t("itemTooltip.requiresLevel", { level: item.requiredLevel })}
            </p>
          )}
          {item.accountBound && (
            <p className="text-ui-muted">{t("itemTooltip.accountBound")}</p>
          )}
        </div>
      )}

      {(item.sellValue !== undefined || item.durability) && (
        <>
          <div aria-hidden className="ui-divider my-3" />
          <div className="flex flex-col items-end gap-1 text-sm">
            {item.sellValue !== undefined && (
              <p className="flex items-center gap-1.5 text-ui-text-bright">
                {t("itemTooltip.sellValue", {
                  value: item.sellValue.toLocaleString(),
                })}
                {/* The coin pixels sit in the middle ~10px of the tile; crop the empty margin. */}
                <span className="flex size-5 items-center justify-center overflow-hidden">
                  <SpriteIcon spriteId={GOLD_COIN_SPRITE_ID} scale={2} className="shrink-0" />
                </span>
              </p>
            )}
            {item.durability && (
              <p className="flex items-center gap-1.5 text-ui-muted">
                {t("itemTooltip.durability", {
                  current: item.durability.current,
                  max: item.durability.max,
                })}
                {/* Centered in the same 20px column as the coin above. */}
                <span className="flex size-5 items-center justify-center">
                  <DurabilityIcon />
                </span>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
