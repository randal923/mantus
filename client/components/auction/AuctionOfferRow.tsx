"use client";

import { useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import type {
  AuctionHouseItem,
  AuctionOffer,
  AuctionOfferAcceptanceIntent,
} from "./auctionTypes";

interface AuctionOfferRowProps {
  offer: AuctionOffer;
  item: AuctionHouseItem;
  /** "buy" = the viewer buys from a sell offer; "sell" = fills a buy offer. */
  action: "buy" | "sell";
  goldBalance: number;
  onAcceptOffer?: (intent: AuctionOfferAcceptanceIntent) => void;
}

/**
 * One order-book row. The amount is editable because the server supports
 * partial fills; it is clamped to the offer's remaining amount here purely so
 * the UI cannot ask for something it knows will be refused — the server
 * re-validates the amount, the price and the funds at execution time.
 */
export function AuctionOfferRow({
  offer,
  item,
  action,
  goldBalance,
  onAcceptOffer,
}: AuctionOfferRowProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const [amount, setAmount] = useState(offer.amount);
  const clamped = Math.min(Math.max(1, amount || 1), offer.amount);
  const total = clamped * offer.pricePerItem;
  const unaffordable = action === "buy" && goldBalance < total;
  const understocked = action === "sell" && item.ownedCount < clamped;
  const disabledReason = offer.mine
    ? t("auction.tooltips.ownOffer")
    : unaffordable
      ? t("auction.tooltips.insufficientGold")
      : understocked
        ? t("auction.tooltips.insufficientItems")
        : undefined;

  return (
    <tr className="border-t border-ui-stone-light/10 transition-colors hover:bg-white/3">
      <td className="px-3 py-2.5">
        <label className="flex items-center gap-2">
          <span className="sr-only">
            {t("auction.amountToTrade", { item: item.name })}
          </span>
          <input
            type="number"
            min={1}
            max={offer.amount}
            step={1}
            value={amount}
            disabled={offer.mine === true}
            onChange={(event) => setAmount(Number(event.target.value))}
            onBlur={() => setAmount(clamped)}
            className="w-20 rounded-md border border-ui-stone-light/20 bg-black/35 px-2 py-1 text-right font-semibold tabular-nums text-ui-text-bright disabled:opacity-50"
          />
          <span className="text-xs tabular-nums text-ui-muted">
            / {offer.amount.toLocaleString(language)}
          </span>
        </label>
      </td>
      <td className="px-3 py-2.5 tabular-nums text-ui-text">
        {offer.pricePerItem.toLocaleString(language)}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-ui-gold">
        {total.toLocaleString(language)}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-ui-muted">
        {new Date(offer.expiresAt).toLocaleDateString(language, {
          month: "short",
          day: "numeric",
        })}
      </td>
      <td className="px-3 py-2 text-right">
        <span className="flex items-center justify-end gap-2">
          {offer.mine && (
            <span className="rounded-full border border-ui-gold/25 bg-black/30 px-2 py-0.5 text-xs tracking-wider text-ui-gold uppercase">
              {t("auction.yours")}
            </span>
          )}
          {/* Disabled buttons swallow pointer events, so the tooltip lives on
              a wrapping span. */}
          <span title={disabledReason}>
            <Button
              size="sm"
              {...(action === "buy" ? { variant: "primary" as const } : {})}
              disabled={
                !onAcceptOffer ||
                offer.mine === true ||
                unaffordable ||
                understocked
              }
              aria-label={t(
                action === "buy"
                  ? "auction.buyOfferAction"
                  : "auction.sellOfferAction",
                {
                  count: clamped,
                  item: item.name,
                  total: total.toLocaleString(language),
                },
              )}
              onClick={() =>
                onAcceptOffer?.({ offerId: offer.id, amount: clamped })
              }
            >
              {t(action === "buy" ? "auction.buy" : "auction.sell")}
            </Button>
          </span>
        </span>
      </td>
    </tr>
  );
}
