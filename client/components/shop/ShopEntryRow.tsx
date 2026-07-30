"use client";

import type { ShopEntryProjection } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface ShopEntryRowProps {
  entry: ShopEntryProjection;
  selected: boolean;
  currencyName: string;
  /** False when the player cannot afford or carry even one of this offer. */
  affordable: boolean;
  onSelect: (offerId: string) => void;
}

/**
 * One line of the offer list. Selecting a row hands it to the shared amount
 * panel below, as in the Tibia client — the row itself trades nothing.
 */
export function ShopEntryRow({
  entry,
  selected,
  currencyName,
  affordable,
  onSelect,
}: ShopEntryRowProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);

  return (
    <li>
      <button
        type="button"
        aria-current={selected}
        onClick={() => onSelect(entry.offerId)}
        className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
          selected
            ? "border-ui-gold/60 bg-ui-gold/10"
            : "border-ui-stone-light/15 bg-ui-panel-deep/45 hover:border-ui-stone-light/30"
        }`}
      >
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-md border border-ui-stone-light/15 bg-black/40 ${
            affordable ? "" : "opacity-40"
          }`}
        >
          <SpriteIcon
            spriteId={entry.spriteId}
            clientId={entry.clientId}
            scale={1}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-ui-text-bright">
            {entry.name}
          </span>
          <span className="block text-xs tabular-nums text-ui-muted">
            {entry.buyPrice !== undefined &&
              t("shop.priceEach", {
                price: entry.buyPrice.toLocaleString(language),
                currency: currencyName,
              })}
            {entry.buyPrice !== undefined &&
              entry.sellPrice !== undefined &&
              " · "}
            {entry.sellPrice !== undefined &&
              t("shop.sellFor", {
                price: entry.sellPrice.toLocaleString(language),
                currency: currencyName,
              })}
          </span>
        </span>
        {entry.owned > 0 && (
          <span className="shrink-0 rounded-sm border border-ui-stone-light/15 bg-black/35 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-ui-muted">
            {t("shop.ownedCount", { count: entry.owned })}
          </span>
        )}
      </button>
    </li>
  );
}
