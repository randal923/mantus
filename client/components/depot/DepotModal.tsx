"use client";

import { useState } from "react";
import type {
  DepotActionFailedReason,
  DepotItemEntry,
  DepotLocation,
  DepotStateMessage,
  InventoryItem,
  InventorySlotEntry,
  StashEntry,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface DepotModalProps {
  state: DepotStateMessage;
  inventoryItems: ReadonlyArray<InventorySlotEntry>;
  pending: boolean;
  error: DepotActionFailedReason | null;
  onBrowse(location: DepotLocation, page: number, query: string): void;
  onDeposit(item: InventoryItem): void;
  onWithdraw(item: DepotItemEntry): void;
  onStashDeposit(item: InventoryItem, count: number): void;
  onStashWithdraw(item: StashEntry, count: number): void;
  onClose(): void;
}

export function DepotModal({
  state,
  inventoryItems,
  pending,
  error,
  onBrowse,
  onDeposit,
  onWithdraw,
  onStashDeposit,
  onStashWithdraw,
  onClose,
}: DepotModalProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((store) => store.language);
  const [query, setQuery] = useState(state.query);
  const [amount, setAmount] = useState(1);
  const locations: ReadonlyArray<DepotLocation> = [
    "depot",
    "inbox",
    "stash",
  ];
  const carriedItems =
    state.location === "stash"
      ? inventoryItems.filter(({ item }) => item.stowable)
      : inventoryItems;
  const validAmount = Number.isInteger(amount) && amount >= 1 && amount <= 100;

  return (
    <Modal
      title={t("depot.title", { townName: state.townName })}
      onClose={onClose}
      size="wide"
    >
      <div className="flex min-h-128 flex-col gap-4">
        <nav
          aria-label={t("depot.locations")}
          className="grid grid-cols-3 gap-2"
        >
          {locations.map((location) => {
            const count =
              location === "depot"
                ? state.depotCount
                : location === "inbox"
                  ? state.inboxCount
                  : state.stashCount;
            return (
              <Button
                key={location}
                variant={state.location === location ? "primary" : "secondary"}
                aria-pressed={state.location === location}
                disabled={pending}
                onClick={() => {
                  setQuery("");
                  onBrowse(location, 1, "");
                }}
              >
                {t(`depot.${location}`)} ({count.toLocaleString(language)}
                {location === "depot"
                  ? ` / ${state.depotCapacity.toLocaleString(language)}`
                  : location === "inbox"
                    ? ` / ${state.inboxCapacity.toLocaleString(language)}`
                    : ""}
                )
              </Button>
            );
          })}
        </nav>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onBrowse(state.location, 1, query.trim());
          }}
        >
          <Input
            label={t("depot.search")}
            name="depot-search"
            maxLength={60}
            value={query}
            placeholder={t("depot.searchPlaceholder")}
            disabled={pending}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="flex-1"
          />
          <Button type="submit" variant="primary" disabled={pending}>
            {t("depot.search")}
          </Button>
        </form>

        {error && (
          <p
            role="alert"
            aria-live="assertive"
            className="border-l-2 border-red-400/60 bg-red-950/40 px-3 py-2 text-xs leading-5 text-red-200"
          >
            {t(`depot.errors.${error}`)}
          </p>
        )}

        <div
          className={`grid min-h-0 flex-1 gap-4 ${
            state.location === "inbox" ? "" : "lg:grid-cols-2"
          }`}
        >
          {state.location !== "inbox" && (
            <section
              aria-label={t("depot.carriedItems")}
              className="flex min-h-0 flex-col rounded-xl border border-ui-gold/15 bg-black/25 p-3"
            >
              <header className="mb-3 flex items-center justify-between border-b border-ui-gold/10 pb-2">
                <h3 className="font-display text-xs tracking-widest text-ui-gold uppercase">
                  {t("depot.carriedItems")}
                </h3>
              </header>
              <ul className="ui-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {carriedItems.map(({ item }) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border border-ui-stone/25 bg-black/30 p-2"
                  >
                    <SpriteIcon spriteId={item.spriteId} scale={1.1} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ui-text-bright">
                        {item.name}
                      </div>
                      <div className="text-xs text-ui-muted">
                        {t("depot.itemCount", { count: item.count })}
                      </div>
                    </div>
                    {state.location === "depot" && (
                      <Button
                        size="sm"
                        onClick={() => onDeposit(item)}
                      >
                        {t("depot.store")}
                      </Button>
                    )}
                    {state.location === "stash" && (
                      <Button
                        size="sm"
                        disabled={!validAmount || amount > item.count}
                        onClick={() => onStashDeposit(item, amount)}
                      >
                        {t("depot.stow")}
                      </Button>
                    )}
                  </li>
                ))}
                {carriedItems.length === 0 && (
                  <li className="py-8 text-center text-xs text-ui-muted">
                    {t("depot.noCarriedItems")}
                  </li>
                )}
              </ul>
            </section>
          )}

          <section
            aria-label={t(`depot.${state.location}`)}
            className="flex min-h-0 flex-col rounded-xl border border-ui-gold/15 bg-black/25 p-3"
          >
            <header className="mb-3 flex items-center justify-between border-b border-ui-gold/10 pb-2">
              <div>
                <h3 className="font-display text-xs tracking-widest text-ui-gold uppercase">
                  {t(`depot.${state.location}`)}
                </h3>
                {state.query && (
                  <p className="text-xs text-ui-muted">
                    {t("depot.searchResults", { query: state.query })}
                  </p>
                )}
              </div>
              {state.location === "stash" && (
                <Input
                  label={t("depot.amount")}
                  name="stash-withdraw-amount"
                  type="number"
                  min={1}
                  max={100}
                  value={amount}
                  onChange={(event) =>
                    setAmount(Math.trunc(event.currentTarget.valueAsNumber || 0))
                  }
                  className="w-24"
                />
              )}
            </header>
            <ul className="ui-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {state.entries.map((entry) => (
                <li
                  key={
                    entry.location === "stash"
                      ? `stash-${entry.itemTypeId}`
                      : entry.itemId
                  }
                  className="flex items-center gap-3 rounded-lg border border-ui-stone/25 bg-black/30 p-2"
                >
                  <SpriteIcon spriteId={entry.spriteId} scale={1.1} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ui-text-bright">
                      {entry.name}
                    </div>
                    <div className="text-xs text-ui-muted">
                      {t("depot.itemCount", { count: entry.count })}
                      {entry.location !== "stash" &&
                        entry.containedItemCount > 0 &&
                        ` · ${t("depot.contains", {
                          count: entry.containedItemCount,
                        })}`}
                    </div>
                  </div>
                  {entry.location === "stash" ? (
                    <Button
                      size="sm"
                      disabled={!validAmount || amount > entry.count}
                      onClick={() => onStashWithdraw(entry, amount)}
                    >
                      {t("depot.withdraw")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => onWithdraw(entry)}
                    >
                      {t("depot.withdraw")}
                    </Button>
                  )}
                </li>
              ))}
              {state.entries.length === 0 && (
                <li className="py-8 text-center text-xs text-ui-muted">
                  {t("depot.noItems")}
                </li>
              )}
            </ul>
            <footer className="mt-3 flex items-center justify-between border-t border-ui-gold/10 pt-3 text-xs text-ui-muted">
              <Button
                size="sm"
                disabled={pending || state.page <= 1}
                onClick={() =>
                  onBrowse(state.location, state.page - 1, state.query)
                }
              >
                {t("depot.previous")}
              </Button>
              <span>
                {t("depot.page", {
                  page: state.page,
                  pageCount: state.pageCount,
                })}
              </span>
              <Button
                size="sm"
                disabled={pending || state.page >= state.pageCount}
                onClick={() =>
                  onBrowse(state.location, state.page + 1, state.query)
                }
              >
                {t("depot.next")}
              </Button>
            </footer>
          </section>
        </div>
      </div>
    </Modal>
  );
}
