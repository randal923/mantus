"use client";

import Image from "next/image";
import {
  PREY_RULES,
  type StoreProductKind,
  type StoreSubOffer,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";

interface StorePriceButtonProps {
  offer: StoreSubOffer;
  /** Premium offers count days rather than units. */
  kind: StoreProductKind;
  balance: number;
  busy: boolean;
  onSelect: () => void;
}

/**
 * One priced variant of a product — the store's "100x for 18" button.
 *
 * `disabled` and its reason come from the server; the affordability tint is
 * the only thing decided here, and it is decoration: the server re-checks the
 * balance when the purchase runs.
 */
export function StorePriceButton({
  offer,
  kind,
  balance,
  busy,
  onSelect,
}: StorePriceButtonProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const affordable = balance >= offer.price;
  const price = offer.price.toLocaleString(language);
  // The visible label is a bare number; the accessible name says what it buys.
  const days = kind === "premium";
  const label =
    offer.count === undefined
      ? t("store.priceLabel", { price })
      : days
        ? t("store.priceLabelWithDays", { count: offer.count, price })
        : t("store.priceLabelWithCount", { count: offer.count, price });

  return (
    <button
      type="button"
      aria-label={label}
      disabled={offer.disabled === true || busy}
      title={
        offer.disabledReason === undefined
          ? undefined
          : t(`store.offerDisabled.${offer.disabledReason}`, {
              count: PREY_RULES.maxWildcards,
            })
      }
      onClick={onSelect}
      className="flex h-10 min-w-24 items-center justify-center gap-2 border border-ui-gold/25 bg-black/55 px-3 text-left shadow-inner shadow-black/50 transition-[border-color,background-color] not-disabled:hover:border-ui-gold/60 not-disabled:hover:bg-ui-panel-light/80 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ui-gold/60 focus-visible:outline-none"
    >
      {offer.count !== undefined && (
        <span className="font-display text-xs text-ui-text-bright tabular-nums">
          {days
            ? t("store.days", { count: offer.count })
            : `${offer.count.toLocaleString(language)}x`}
        </span>
      )}
      <span className="flex items-center gap-1">
        <Image
          src="/assets/ui/mantus-coin.png"
          alt=""
          width={16}
          height={16}
          className="shrink-0"
        />
        <span
          className={`font-display text-base font-bold tabular-nums ${
            affordable ? "text-cyan-100" : "text-red-400"
          }`}
        >
          {price}
        </span>
      </span>
    </button>
  );
}
