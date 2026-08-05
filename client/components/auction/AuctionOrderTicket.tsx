"use client";

import { useState, type FormEvent } from "react";
import { MARKET_LIMITS } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { AuctionRarityBadge } from "./AuctionRarityBadge";
import type {
  AuctionAttributedItem,
  AuctionHouseItem,
  AuctionOfferSide,
  AuctionOrderIntent,
} from "./auctionTypes";

const GOLD_COIN_SPRITE = 7384;

interface AuctionOrderTicketProps {
  item?: AuctionHouseItem;
  goldBalance: number;
  /** The viewer's own listable rarity items of the browsed type. */
  attributedItems?: ReadonlyArray<AuctionAttributedItem>;
  onCreateOrder?: (intent: AuctionOrderIntent) => void;
}

export function AuctionOrderTicket({
  item,
  goldBalance,
  attributedItems,
  onCreateOrder,
}: AuctionOrderTicketProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const [side, setSide] = useState<AuctionOfferSide>("sell");
  const [amountInput, setAmountInput] = useState("1");
  const [priceInput, setPriceInput] = useState(
    String(item?.averagePrice ?? 0),
  );
  const [specificItemId, setSpecificItemId] = useState<string | null>(null);
  // A stale id from a previously browsed type simply resolves to nothing.
  const specificItem =
    side === "sell" && specificItemId
      ? (attributedItems?.find((entry) => entry.itemId === specificItemId) ??
        null)
      : null;
  const amount = specificItem ? 1 : Number(amountInput);
  const pricePerItem = Number(priceInput);
  const total = amount * pricePerItem;
  const hasValidValues =
    Number.isSafeInteger(amount) &&
    Number.isSafeInteger(pricePerItem) &&
    amount > 0 &&
    amount <= MARKET_LIMITS.maxAmountStackable &&
    pricePerItem > 0 &&
    pricePerItem <= MARKET_LIMITS.maxUnitPrice &&
    total <= MARKET_LIMITS.maxTotalPrice;
  const hasEnoughGold = side === "sell" || total <= goldBalance;
  const hasEnoughItems =
    side === "buy" ||
    specificItem !== null ||
    (item !== undefined && amount <= item.ownedCount);
  const canSubmit =
    item !== undefined &&
    onCreateOrder !== undefined &&
    hasValidValues &&
    hasEnoughGold &&
    hasEnoughItems;

  const submitOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !item) return;

    onCreateOrder({
      itemId: item.id,
      side,
      amount,
      pricePerItem,
      ...(specificItem ? { specificItemId: specificItem.itemId } : {}),
    });
  };

  return (
    <aside className="flex h-full min-h-[30rem] flex-col overflow-hidden rounded-xl border border-ui-stone-light/15 bg-black/25 shadow-inner shadow-black/40 lg:min-h-0">
      <header className="border-b border-ui-gold/15 px-4 py-3">
        <span className="text-xs font-semibold tracking-[0.18em] text-ui-muted uppercase">
          {t("auction.trading")}
        </span>
        <h2 className="font-display text-base tracking-wide text-ui-text-bright">
          {t("auction.createOffer")}
        </h2>
      </header>

      {!item ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm leading-6 text-ui-muted">
          {t("auction.selectItemToCreate")}
        </div>
      ) : (
        <form
          onSubmit={submitOrder}
          className="ui-scrollbar flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-4 self-center overflow-y-auto p-4"
        >
          <div className="flex items-center gap-3 rounded-lg border border-ui-stone-light/15 bg-ui-panel-deep/45 p-2.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-ui-stone-light/15 bg-black/40">
              <SpriteIcon spriteId={item.spriteId} clientId={item.clientId} scale={1.1} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ui-text-bright">
                {item.name}
              </span>
              <span className="block text-xs text-ui-muted">
                {t("auction.owned", { count: item.ownedCount })}
              </span>
            </span>
          </div>

          <fieldset>
            <legend className="mb-2 font-display text-xs font-semibold tracking-[0.16em] text-ui-gold uppercase">
              {t("auction.offerType")}
            </legend>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-ui-stone-light/15 bg-black/25 p-1.5">
              {(["sell", "buy"] as const).map((sideOption) => (
                <button
                  key={sideOption}
                  type="button"
                  aria-pressed={side === sideOption}
                  onClick={() => setSide(sideOption)}
                  className={`rounded-md border px-3 py-2 font-display text-sm tracking-wider uppercase outline-none transition-[border-color,background-color,color] focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                    side === sideOption
                      ? "border-ui-accent-light/55 bg-ui-accent-deep/75 text-ui-text-bright"
                      : "border-transparent text-ui-muted hover:border-ui-gold/25 hover:text-ui-text"
                  }`}
                >
                  {t(`auction.${sideOption}`)}
                </button>
              ))}
            </div>
          </fieldset>

          {side === "sell" && (attributedItems?.length ?? 0) > 0 && (
            <fieldset>
              <legend className="mb-2 font-display text-xs font-semibold tracking-[0.16em] text-ui-gold uppercase">
                {t("auction.itemToList")}
              </legend>
              <div className="flex flex-col gap-1.5 rounded-lg border border-ui-stone-light/15 bg-black/25 p-1.5">
                <button
                  type="button"
                  aria-pressed={specificItem === null}
                  onClick={() => setSpecificItemId(null)}
                  className={`rounded-md border px-3 py-2 text-left text-sm outline-none transition-[border-color,background-color,color] focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                    specificItem === null
                      ? "border-ui-accent-light/55 bg-ui-accent-deep/60 text-ui-text-bright"
                      : "border-transparent text-ui-muted hover:border-ui-gold/25 hover:text-ui-text"
                  }`}
                >
                  {t("auction.standardStock", { count: item.ownedCount })}
                </button>
                {attributedItems?.map((entry) => (
                  <button
                    key={entry.itemId}
                    type="button"
                    aria-pressed={specificItem?.itemId === entry.itemId}
                    onClick={() => setSpecificItemId(entry.itemId)}
                    className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm outline-none transition-[border-color,background-color,color] focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                      specificItem?.itemId === entry.itemId
                        ? "border-ui-accent-light/55 bg-ui-accent-deep/60 text-ui-text-bright"
                        : "border-transparent text-ui-muted hover:border-ui-gold/25 hover:text-ui-text"
                    }`}
                  >
                    <span className="truncate">{entry.tooltip.name}</span>
                    <AuctionRarityBadge tooltip={entry.tooltip} />
                  </button>
                ))}
              </div>
              {specificItem && (
                <p className="mt-2 text-xs leading-5 text-ui-muted">
                  {t("auction.uniqueListingNotice")}
                </p>
              )}
            </fieldset>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t("auction.amount")}
              name="auction-amount"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={String(MARKET_LIMITS.maxAmountStackable).length}
              value={specificItem ? "1" : amountInput}
              disabled={specificItem !== null}
              onChange={(event) => {
                const next = event.currentTarget.value;
                if (/^\d*$/.test(next)) setAmountInput(next);
              }}
            />
            <Input
              label={t("auction.piecePrice")}
              name="auction-price"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={String(MARKET_LIMITS.maxUnitPrice).length}
              value={priceInput}
              onChange={(event) => {
                const next = event.currentTarget.value;
                if (/^\d*$/.test(next)) setPriceInput(next);
              }}
            />
          </div>

          <dl className="space-y-2 rounded-lg border border-ui-gold/15 bg-black/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-3 text-ui-muted">
              <dt>{t("auction.estimatedTotal")}</dt>
              <dd className="flex items-center gap-1.5 font-semibold tabular-nums text-ui-text-bright">
                {total.toLocaleString(language)}
                <SpriteIcon spriteId={GOLD_COIN_SPRITE} scale={0.6} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-ui-muted">
              <dt>{t("auction.availableGold")}</dt>
              <dd className="tabular-nums text-ui-text">
                {goldBalance.toLocaleString(language)}
              </dd>
            </div>
          </dl>

          {!hasValidValues && (
            <p role="alert" className="text-sm leading-6 text-red-200">
              {t("auction.invalidOrderValues")}
            </p>
          )}
          {!hasEnoughGold && (
            <p role="alert" className="text-sm leading-6 text-red-200">
              {t("auction.insufficientGold")}
            </p>
          )}
          {!hasEnoughItems && (
            <p role="alert" className="text-sm leading-6 text-red-200">
              {t("auction.insufficientItems")}
            </p>
          )}

          <div className="mt-auto space-y-3 pt-2">
            <p className="border-l-2 border-ui-gold/40 bg-ui-gold/5 px-3 py-2 text-sm leading-6 text-ui-muted">
              {t("auction.serverValidationNotice")}
            </p>
            <Button
              type="submit"
              variant="primary"
              disabled={!canSubmit}
              className="w-full"
            >
              {t(
                side === "sell"
                  ? "auction.createSellOffer"
                  : "auction.createBuyOffer",
              )}
            </Button>
          </div>
        </form>
      )}
    </aside>
  );
}
