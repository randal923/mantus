"use client";

import type { ItemTooltipData } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ItemAffixLine } from "./ItemAffixLine";
import { SpriteIcon } from "./SpriteIcon";
import { WeightIcon } from "./WeightIcon";

interface ItemTooltipProps {
  item: ItemTooltipData;
}

/** Hover card describing one item; purely presentational, stats come from the server. */
export function ItemTooltip({ item }: ItemTooltipProps) {
  const { t } = useAppTranslation();

  return (
    <div
      role="tooltip"
      aria-label={item.name}
      className="relative isolate w-80 overflow-hidden rounded-lg border border-ui-stone/70 bg-ui-panel-deep/95 p-4 font-tibia text-ui-text shadow-[0_14px_40px_rgba(0,0,0,0.65)]"
    >
      <div
        aria-hidden
        className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.05] mix-blend-soft-light"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 -z-10 h-24 bg-radial from-ui-stone-light/10 to-transparent blur-xl"
      />

      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold tracking-[0.08em] text-ui-text-bright uppercase [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
            {item.name}
          </h3>
          <p className="mt-1 text-xs text-ui-muted">{item.typeLine}</p>
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

      {(item.requiredLevel !== undefined || item.vocations) && (
        <div className="mt-3 text-right text-sm">
          {item.requiredLevel !== undefined && (
            <p className="text-ui-text-bright">
              {t("itemTooltip.requiresLevel", { level: item.requiredLevel })}
            </p>
          )}
          {item.vocations && (
            <p className="text-ui-muted">
              {t("itemTooltip.vocations", {
                vocations: item.vocations.join(", "),
              })}
            </p>
          )}
        </div>
      )}

      {item.description && (
        <p className="mt-3 text-sm leading-5 text-ui-muted italic">
          {item.description}
        </p>
      )}

      <div aria-hidden className="ui-divider my-3" />
      <div className="flex flex-col items-end gap-1 text-sm text-ui-muted">
        {item.containerCapacity !== undefined && (
          <p>
            {t("itemTooltip.containerSlots", {
              count: item.containerCapacity,
            })}
          </p>
        )}
        {item.charges !== undefined && (
          <p>{t("itemTooltip.charges", { count: item.charges })}</p>
        )}
        <p className="flex items-center gap-1.5">
          {t("itemTooltip.weight", {
            weight: (item.weight / 100).toFixed(2),
          })}
          <span className="flex size-5 items-center justify-center">
            <WeightIcon />
          </span>
        </p>
      </div>
    </div>
  );
}
