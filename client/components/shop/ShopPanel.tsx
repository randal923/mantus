"use client";

import { useState } from "react";
import type {
  ShopActionFailedReason,
  ShopEntryProjection,
  ShopTransactedMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { ShopEntryRow } from "./ShopEntryRow";

interface ShopPanelProps {
  npcName: string;
  entries: ReadonlyArray<ShopEntryProjection>;
  carriedTotal: number;
  currencyName: string;
  currencySpriteId: number;
  pending: boolean;
  error: ShopActionFailedReason | null;
  lastTransaction: ShopTransactedMessage | null;
  onBuy: (offerId: string, amount: number) => void;
  onSell: (offerId: string, amount: number) => void;
  onClose: () => void;
}

export function ShopPanel({
  npcName,
  entries,
  carriedTotal,
  currencyName,
  currencySpriteId,
  pending,
  error,
  lastTransaction,
  onBuy,
  onSell,
  onClose,
}: ShopPanelProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const visibleEntries = entries.filter((entry) =>
    entry.name.toLowerCase().includes(normalizedSearch),
  );

  return (
    <Modal title={t("shop.title", { npcName })} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label={t("shop.search")}
          name="shop-search"
          type="search"
          placeholder={t("shop.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />

        <div className="flex items-center gap-1.5 text-xs tabular-nums text-ui-muted">
          {t("shop.carried", { currency: currencyName })}
          <span className="font-semibold text-ui-text-bright">
            {carriedTotal.toLocaleString(language)}
          </span>
          <SpriteIcon spriteId={currencySpriteId} scale={0.6} />
        </div>

        {error && (
          <p
            role="alert"
            aria-live="assertive"
            className="border-l-2 border-red-400/60 bg-red-950/40 px-3 py-2 text-sm leading-6 text-red-200"
          >
            {t(`shop.errors.${error}`)}
          </p>
        )}
        {!error && lastTransaction && (
          <p aria-live="polite" className="border-l-2 border-ui-gold/40 bg-ui-gold/5 px-3 py-2 text-sm leading-6 text-ui-muted">
            {t(
              lastTransaction.kind === "purchase"
                ? "shop.bought"
                : "shop.sold",
              {
                count: lastTransaction.amount,
                name: lastTransaction.name,
                price: lastTransaction.totalPrice.toLocaleString(language),
                currency: currencyName,
              },
            )}
          </p>
        )}

        {visibleEntries.length === 0 ? (
          <p className="py-6 text-center text-sm text-ui-muted">
            {t("shop.noItems")}
          </p>
        ) : (
          <ul className="ui-scrollbar flex max-h-96 flex-col gap-1.5 overflow-y-auto pr-1">
            {visibleEntries.map((entry) => (
              <ShopEntryRow
                key={entry.offerId}
                entry={entry}
                disabled={pending}
                currencyName={currencyName}
                onBuy={onBuy}
                onSell={onSell}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
