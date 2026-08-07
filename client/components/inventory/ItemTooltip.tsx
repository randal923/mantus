"use client";

import { MAX_CONTAINER_CAPACITY, type ItemTooltipData } from "@tibia/protocol";
import Image from "next/image";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { ItemAffixLine } from "./ItemAffixLine";
import { SpriteIcon } from "./SpriteIcon";
import { WeightIcon } from "./WeightIcon";

interface ItemTooltipProps {
  item: ItemTooltipData;
}

/**
 * Tailwind needs literal class strings, so each rarity carries its full set
 * (same pattern as BestiaryLootList).
 */
const RARITY_STYLES = {
  common: {
    line: "text-rarity-common",
    border: "border-rarity-common/40",
    tint: "from-rarity-common/15 via-rarity-common/5 to-transparent",
  },
  uncommon: {
    line: "text-rarity-uncommon",
    border: "border-rarity-uncommon/40",
    tint: "from-rarity-uncommon/15 via-rarity-uncommon/5 to-transparent",
  },
  rare: {
    line: "text-rarity-rare",
    border: "border-rarity-rare/40",
    tint: "from-rarity-rare/15 via-rarity-rare/5 to-transparent",
  },
  epic: {
    line: "text-rarity-epic",
    border: "border-rarity-epic/40",
    tint: "from-rarity-epic/15 via-rarity-epic/5 to-transparent",
  },
  legendary: {
    line: "text-rarity-legendary",
    border: "border-rarity-legendary/40",
    tint: "from-rarity-legendary/15 via-rarity-legendary/5 to-transparent",
  },
} as const;

/** Hover card describing one item; purely presentational, stats come from the server. */
export function ItemTooltip({ item }: ItemTooltipProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const rarity = item.rarity ? RARITY_STYLES[item.rarity] : undefined;
  const hasDetails = Boolean(
    item.primaryStat ||
      item.affixes.length > 0 ||
      item.requiredLevel !== undefined ||
      item.vocations?.length ||
      item.description,
  );

  return (
    <div
      role="tooltip"
      aria-label={item.name}
      className={`relative isolate w-80 overflow-hidden rounded-lg border ${
        rarity ? rarity.border : "border-ui-stone/70"
      } bg-ui-panel-deep/95 p-4 font-tibia text-ui-text shadow-[0_14px_40px_rgba(0,0,0,0.65)]`}
    >
      <div
        aria-hidden
        className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.05] mix-blend-soft-light"
      />
      {rarity ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-36 bg-gradient-to-b ${rarity.tint}`}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 -z-10 h-24 bg-radial from-ui-stone-light/10 to-transparent blur-xl"
        />
      )}

      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold tracking-[0.08em] text-ui-text-bright uppercase [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
            {item.name}
          </h3>
          <p
            className={`mt-1 text-sm ${
              rarity ? `font-medium ${rarity.line}` : "text-ui-muted"
            }`}
          >
            {item.rarity
              ? `${t(`itemTooltip.rarity.${item.rarity}`)} | ${item.typeLine}`
              : item.typeLine}
          </p>
        </div>
        <SpriteIcon
          spriteId={item.spriteId}
          scale={2}
          className="shrink-0 drop-shadow-[0_4px_6px_rgba(0,0,0,0.7)]"
        />
      </header>

      {hasDetails && <div aria-hidden className="ui-divider my-3" />}

      {item.primaryStat && (
        <p className="text-lg font-semibold text-ui-success-light">
          {item.primaryStat}
        </p>
      )}

      {item.affixes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {item.affixes.map((affix, index) => (
            <ItemAffixLine key={`${index}:${affix.text}`} affix={affix} />
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

      {hasDetails && <div aria-hidden className="ui-divider my-3" />}
      <div
        className={`flex flex-col items-end gap-1 text-sm text-ui-muted ${hasDetails ? "" : "mt-3"}`}
      >
        {item.containerCapacity !== undefined && (
          <p>
            {item.containerCapacity >= MAX_CONTAINER_CAPACITY
              ? t("itemTooltip.containerSlotsUnlimited")
              : t("itemTooltip.containerSlots", {
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
        {item.worth !== undefined && (
          <p className="flex items-center gap-1.5 font-semibold text-ui-text-bright tabular-nums">
            <Image
              src="/assets/cyclopedia/currency/gold.png"
              alt=""
              width={16}
              height={16}
              className="[image-rendering:pixelated]"
            />
            {item.worth.toLocaleString(language)}
          </p>
        )}
      </div>
    </div>
  );
}
