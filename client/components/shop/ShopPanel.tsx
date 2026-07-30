"use client";

import { useState } from "react";
import type {
  ShopActionFailedReason,
  ShopEntryProjection,
  ShopTransactedMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { maxShopPurchaseAmount } from "../../lib/shop/maxShopPurchaseAmount";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { ShopAmountPanel } from "./ShopAmountPanel";
import { ShopEntryRow } from "./ShopEntryRow";

interface ShopPanelProps {
  npcName: string;
  entries: ReadonlyArray<ShopEntryProjection>;
  selectedOfferId: string | null;
  /** Money the shop can draw on: carried coins plus bank for a gold shop. */
  availableMoney: number;
  /** Spare carry capacity in hundredths of an ounce. */
  freeCapacity: number;
  currencyName: string;
  currencySpriteId: number;
  error: ShopActionFailedReason | null;
  lastTransaction: ShopTransactedMessage | null;
  onSelect: (offerId: string) => void;
  onBuy: (offerId: string, amount: number) => void;
  onSell: (offerId: string, amount: number) => void;
  onClose: () => void;
}

/**
 * The trade window: an offer list on top, and one shared setup panel below that
 * drives whichever offer is selected — the layout the Tibia client uses.
 */
export function ShopPanel({
  npcName,
  entries,
  selectedOfferId,
  availableMoney,
  freeCapacity,
  currencyName,
  currencySpriteId,
  error,
  lastTransaction,
  onSelect,
  onBuy,
  onSell,
  onClose,
}: ShopPanelProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [search, setSearch] = useState("");
  // The amount the player asked for, which may exceed what they can currently
  // afford. It is clamped for display and for the intent, but kept as typed so
  // it recovers when they get more money instead of ratcheting down.
  const [desiredAmount, setDesiredAmount] = useState(1);

  const normalizedSearch = search.trim().toLowerCase();
  const tradable = entries.filter((entry) =>
    mode === "buy" ? entry.buyPrice !== undefined : entry.sellPrice !== undefined,
  );
  const visibleEntries = tradable.filter((entry) =>
    entry.name.toLowerCase().includes(normalizedSearch),
  );
  const selected =
    tradable.find((entry) => entry.offerId === selectedOfferId) ??
    visibleEntries[0];

  const limitFor = (entry: ShopEntryProjection): number =>
    mode === "buy"
      ? maxShopPurchaseAmount({
          unitPrice: entry.buyPrice ?? 0,
          unitWeight: entry.weight,
          availableMoney,
          freeCapacity,
          maximumAmount: entry.maximumAmount,
        })
      : Math.max(0, Math.min(entry.maximumAmount, entry.owned));

  const maxAmount = selected ? limitFor(selected) : 0;
  const amount = selected
    ? Math.max(
        Math.min(desiredAmount, maxAmount),
        Math.min(selected.minimumAmount, maxAmount),
      )
    : 0;
  const unitPrice = selected
    ? (mode === "buy" ? selected.buyPrice : selected.sellPrice) ?? 0
    : 0;

  return (
    <Modal
      title={t("shop.title", { npcName })}
      onClose={onClose}
      tabs={{
        label: t("shop.title", { npcName }),
        items: [
          { id: "buy", label: t("shop.buy") },
          { id: "sell", label: t("shop.sell") },
        ],
        selected: mode,
        onSelect: (id) => setMode(id === "sell" ? "sell" : "buy"),
      }}
      footer={
        selected ? (
          <ShopAmountPanel
            key={`${selected.offerId}-${mode}`}
            entry={selected}
            mode={mode}
            amount={amount}
            maxAmount={maxAmount}
            totalPrice={unitPrice * amount}
            availableMoney={availableMoney}
            currencyName={currencyName}
            currencySpriteId={currencySpriteId}
            onAmountChange={setDesiredAmount}
            onTrade={() => {
              if (amount < selected.minimumAmount) return;
              if (mode === "buy") onBuy(selected.offerId, amount);
              else onSell(selected.offerId, amount);
            }}
          />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
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
          <p
            aria-live="polite"
            className="border-l-2 border-ui-gold/40 bg-ui-gold/5 px-3 py-2 text-sm leading-6 text-ui-muted"
          >
            {t(
              lastTransaction.kind === "purchase" ? "shop.bought" : "shop.sold",
              {
                count: lastTransaction.amount,
                name: lastTransaction.name,
                price: lastTransaction.totalPrice.toLocaleString(language),
                currency: currencyName,
              },
            )}
          </p>
        )}

        <Input
          label={t("shop.search")}
          name="shop-search"
          type="search"
          placeholder={t("shop.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />

        {visibleEntries.length === 0 ? (
          <p className="py-6 text-center text-sm text-ui-muted">
            {t("shop.noItems")}
          </p>
        ) : (
          <ul className="ui-scrollbar flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
            {visibleEntries.map((entry) => (
              <ShopEntryRow
                key={entry.offerId}
                entry={entry}
                selected={entry.offerId === selected?.offerId}
                currencyName={currencyName}
                affordable={limitFor(entry) >= entry.minimumAmount}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}

      </div>
    </Modal>
  );
}
