"use client";

import type { ShopEntryProjection } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { RangeSlider } from "../ui/RangeSlider";

interface ShopAmountPanelProps {
  entry: ShopEntryProjection;
  mode: "buy" | "sell";
  amount: number;
  /** Largest amount the current money, capacity and stock allow. */
  maxAmount: number;
  totalPrice: number;
  availableMoney: number;
  currencyName: string;
  currencySpriteId: number;
  onAmountChange: (amount: number) => void;
  onTrade: () => void;
}

/**
 * Drives the selected offer: a slider and matching box for the amount, the
 * running total, and the trade button — the setup panel from the Tibia trade
 * window.
 *
 * `maxAmount` is derived from live money and capacity, so after a purchase the
 * value clamps itself down rather than sending an amount the server refuses.
 */
export function ShopAmountPanel({
  entry,
  mode,
  amount,
  maxAmount,
  totalPrice,
  availableMoney,
  currencyName,
  currencySpriteId,
  onAmountChange,
  onTrade,
}: ShopAmountPanelProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const unavailable = maxAmount < entry.minimumAmount;

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-ui-stone-light/15 bg-ui-panel-deep/45 p-3">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-ui-stone-light/15 bg-black/40">
          <SpriteIcon
            spriteId={entry.spriteId}
            clientId={entry.clientId}
            scale={0.8}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs tabular-nums text-ui-muted">
          {t("shop.weightEach", { weight: (entry.weight / 100).toFixed(2) })}
        </span>
        <Input
          aria-label={t("shop.amountFor", { name: entry.name })}
          name={`shop-amount-${entry.offerId}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={String(entry.maximumAmount).length}
          value={String(amount)}
          disabled={unavailable}
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (!/^\d*$/.test(next)) return;
            onAmountChange(next === "" ? 0 : Number(next));
          }}
          className="w-16 shrink-0"
        />
      </div>

      <RangeSlider
        label={t("shop.amount")}
        value={amount}
        min={unavailable ? 0 : entry.minimumAmount}
        max={maxAmount}
        disabled={unavailable}
        onChange={onAmountChange}
      />

      <dl className="flex flex-col gap-1 text-xs tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-ui-muted">{t("shop.total")}</dt>
          <dd className="font-semibold text-ui-text-bright">
            {totalPrice.toLocaleString(language)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-ui-muted">
            {t("shop.carried", { currency: currencyName })}
          </dt>
          <dd className="flex items-center gap-1.5 font-semibold text-ui-text-bright">
            {availableMoney.toLocaleString(language)}
            <SpriteIcon spriteId={currencySpriteId} scale={0.6} />
          </dd>
        </div>
      </dl>

      <Button
        size="sm"
        variant={mode === "buy" ? "primary" : "secondary"}
        aria-label={t(mode === "buy" ? "shop.buyItem" : "shop.sellItem", {
          name: entry.name,
        })}
        disabled={unavailable}
        onClick={onTrade}
      >
        {t(mode === "buy" ? "shop.buy" : "shop.sell")}
      </Button>
    </div>
  );
}
