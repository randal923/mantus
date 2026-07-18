"use client";

import type { ShopEntryProjection } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";

interface ShopEntryRowProps {
  entry: ShopEntryProjection;
  amount: number;
  disabled: boolean;
  currencyName: string;
  onBuy: (offerId: string, amount: number) => void;
  onSell: (offerId: string, amount: number) => void;
}

export function ShopEntryRow({
  entry,
  amount,
  disabled,
  currencyName,
  onBuy,
  onSell,
}: ShopEntryRowProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const amountUnavailable =
    amount < entry.minimumAmount || amount > entry.maximumAmount;

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
              price: (entry.buyPrice * amount).toLocaleString(language),
              currency: currencyName,
            })}
          {entry.buyPrice !== undefined && entry.sellPrice !== undefined && " · "}
          {entry.sellPrice !== undefined &&
            t("shop.sellFor", {
              price: (entry.sellPrice * amount).toLocaleString(language),
              currency: currencyName,
            })}
        </span>
      </span>
      {entry.buyPrice !== undefined && (
        <Button
          size="sm"
          variant="primary"
          aria-label={t("shop.buyItem", { name: entry.name })}
          disabled={disabled || amountUnavailable}
          onClick={() => onBuy(entry.offerId, amount)}
        >
          {t("shop.buy")}
        </Button>
      )}
      {entry.sellPrice !== undefined && (
        <Button
          size="sm"
          aria-label={t("shop.sellItem", { name: entry.name })}
          disabled={disabled || amountUnavailable}
          onClick={() => onSell(entry.offerId, amount)}
        >
          {t("shop.sell")}
        </Button>
      )}
    </li>
  );
}
