"use client";

import { useState, type FormEvent } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type {
  AuctionHouseItem,
  AuctionOfferSide,
  AuctionOrderIntent,
} from "./auctionTypes";

const GOLD_COIN_SPRITE = 7384;

interface AuctionOrderTicketProps {
  item?: AuctionHouseItem;
  goldBalance: number;
  onCreateOrder?: (intent: AuctionOrderIntent) => void;
}

export function AuctionOrderTicket({
  item,
  goldBalance,
  onCreateOrder,
}: AuctionOrderTicketProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const [side, setSide] = useState<AuctionOfferSide>("sell");
  const [amount, setAmount] = useState(1);
  const [pricePerItem, setPricePerItem] = useState(item?.averagePrice ?? 0);
  const total = amount * pricePerItem;
  const hasValidValues = amount > 0 && pricePerItem > 0;
  const hasEnoughGold = side === "sell" || total <= goldBalance;
  const hasEnoughItems =
    side === "buy" || (item !== undefined && amount <= item.ownedCount);
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
              <SpriteIcon spriteId={item.spriteId} scale={1.1} />
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

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t("auction.amount")}
              name="auction-amount"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={amount}
              onChange={(event) => {
                const nextAmount = event.currentTarget.valueAsNumber;
                setAmount(
                  Number.isFinite(nextAmount) ? Math.trunc(nextAmount) : 0,
                );
              }}
            />
            <Input
              label={t("auction.piecePrice")}
              name="auction-price"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={pricePerItem}
              onChange={(event) => {
                const nextPrice = event.currentTarget.valueAsNumber;
                setPricePerItem(
                  Number.isFinite(nextPrice) ? Math.trunc(nextPrice) : 0,
                );
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
