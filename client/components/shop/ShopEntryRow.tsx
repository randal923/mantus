"use client";

import { useState } from "react";
import type { ShopEntryProjection } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface ShopEntryRowProps {
  entry: ShopEntryProjection;
  disabled: boolean;
  currencyName: string;
  onBuy: (offerId: string, amount: number) => void;
  onSell: (offerId: string, amount: number) => void;
}

export function ShopEntryRow({
  entry,
  disabled,
  currencyName,
  onBuy,
  onSell,
}: ShopEntryRowProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const [amountInput, setAmountInput] = useState(
    String(entry.minimumAmount),
  );
  const amount = Number(amountInput);
  const validAmount =
    amountInput !== "" &&
    Number.isInteger(amount) &&
    amount >= entry.minimumAmount &&
    amount <= entry.maximumAmount;
  const pricedAmount = validAmount ? amount : entry.minimumAmount;
  const amountUnavailable =
    disabled || !validAmount;

  return (
    <li className="flex items-center gap-3 rounded-lg border border-ui-stone-light/15 bg-ui-panel-deep/45 p-2">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-ui-stone-light/15 bg-black/40">
        <SpriteIcon spriteId={entry.spriteId} scale={1} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-ui-text-bright">
          {entry.name}
        </span>
        <span className="block text-xs tabular-nums text-ui-muted">
          {entry.buyPrice !== undefined &&
            t("shop.buyFor", {
              price: (entry.buyPrice * pricedAmount).toLocaleString(language),
              currency: currencyName,
            })}
          {entry.buyPrice !== undefined && entry.sellPrice !== undefined && " · "}
          {entry.sellPrice !== undefined &&
            t("shop.sellFor", {
              price: (entry.sellPrice * pricedAmount).toLocaleString(language),
              currency: currencyName,
            })}
        </span>
      </span>
      <Input
        aria-label={t("shop.amountFor", { name: entry.name })}
        name={`shop-amount-${entry.offerId}`}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={String(entry.maximumAmount).length}
        value={amountInput}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (/^\d*$/.test(next)) setAmountInput(next);
        }}
        className="w-16 shrink-0"
      />
      {entry.buyPrice !== undefined && (
        <Button
          size="sm"
          variant="primary"
          aria-label={t("shop.buyItem", { name: entry.name })}
          disabled={amountUnavailable}
          onClick={() => onBuy(entry.offerId, amount)}
        >
          {t("shop.buy")}
        </Button>
      )}
      {entry.sellPrice !== undefined && (
        <Button
          size="sm"
          aria-label={t("shop.sellItem", { name: entry.name })}
          disabled={amountUnavailable}
          onClick={() => onSell(entry.offerId, amount)}
        >
          {t("shop.sell")}
        </Button>
      )}
    </li>
  );
}
