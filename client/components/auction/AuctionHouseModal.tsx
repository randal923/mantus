"use client";

import { useEffect, useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { CloseButton } from "../ui/CloseButton";
import { AuctionItemBrowser } from "./AuctionItemBrowser";
import { AuctionMyOffers } from "./AuctionMyOffers";
import { AuctionOrderBook } from "./AuctionOrderBook";
import { AuctionOrderTicket } from "./AuctionOrderTicket";
import type {
  AuctionHistoryEntry,
  AuctionHouseItem,
  AuctionItemCategory,
  AuctionOffer,
  AuctionOfferAcceptanceIntent,
  AuctionOrderIntent,
  AuctionOwnOffer,
} from "./auctionTypes";

const GOLD_COIN_SPRITE = 7384;

type AuctionCategoryFilter = "all" | AuctionItemCategory;
type AuctionHouseTab = "offers" | "create" | "mine";

const TAB_LABEL_KEYS: Record<AuctionHouseTab, string> = {
  offers: "auction.offersTab",
  create: "auction.createOfferTab",
  mine: "auction.myOffersTab",
};

interface AuctionHouseModalProps {
  items: ReadonlyArray<AuctionHouseItem>;
  offers: ReadonlyArray<AuctionOffer>;
  goldBalance: number;
  initialItemId?: string;
  /**
   * When provided, selection is controlled by the parent: `null` means no
   * item is selected. When `undefined`, the modal manages selection
   * internally, falling back to the first item.
   */
  selectedItemId?: string | null;
  initialTab?: AuctionHouseTab;
  ownOffers?: ReadonlyArray<AuctionOwnOffer>;
  history?: ReadonlyArray<AuctionHistoryEntry>;
  error?: string | null;
  onClose: () => void;
  onSelectItem?: (itemId: string) => void;
  onAcceptOffer?: (intent: AuctionOfferAcceptanceIntent) => void;
  onCreateOrder?: (intent: AuctionOrderIntent) => void;
  onCancelOffer?: (offerId: string) => void;
}

export function AuctionHouseModal({
  items,
  offers,
  goldBalance,
  initialItemId,
  selectedItemId,
  initialTab = "offers",
  ownOffers = [],
  history = [],
  error = null,
  onClose,
  onSelectItem,
  onAcceptOffer,
  onCreateOrder,
  onCancelOffer,
}: AuctionHouseModalProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const [activeTab, setActiveTab] = useState<AuctionHouseTab>(initialTab);
  const [category, setCategory] = useState<AuctionCategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [internalSelectedItemId, setInternalSelectedItemId] = useState<
    string | undefined
  >(items.find((item) => item.id === initialItemId)?.id ?? items[0]?.id);
  const normalizedSearch = search.trim().toLocaleLowerCase(language);
  const filteredItems = items.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      item.name.toLocaleLowerCase(language).includes(normalizedSearch),
  );
  const selectionControlled = selectedItemId !== undefined;
  const selectedItem = selectionControlled
    ? selectedItemId === null
      ? undefined
      : items.find((item) => item.id === selectedItemId)
    : (items.find((item) => item.id === internalSelectedItemId) ?? items[0]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 backdrop-blur-xs sm:p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auction-house-title"
        aria-describedby="auction-house-description"
        onClick={(event) => event.stopPropagation()}
        className="ui-panel-frame relative isolate flex h-full max-h-[52rem] w-full max-w-7xl flex-col gap-4 overflow-hidden p-3 font-tibia text-ui-text select-none sm:gap-5 sm:p-5"
      >
        <div
          aria-hidden
          className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.045] mix-blend-soft-light"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-40 top-0 -z-10 h-32 bg-radial from-ui-accent/15 to-transparent blur-2xl"
        />

        <header className="flex items-center gap-3 sm:gap-4">
          <span
            aria-hidden
            className="hidden size-12 shrink-0 items-center justify-center rounded-xl border border-ui-gold/20 bg-black/35 text-ui-gold shadow-inner shadow-black/50 sm:flex"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 9h16M6 9V6h12v3M5 9v10h14V9M9 13h6M9 16h4" />
              <path d="m8 6 4-2 4 2" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p
              id="auction-house-description"
              className="truncate text-[9px] font-semibold tracking-[0.24em] text-ui-gold uppercase"
            >
              {t("auction.subtitle")}
            </p>
            <h1
              id="auction-house-title"
              className="truncate font-display text-xl tracking-[0.1em] text-ui-text-bright uppercase [text-shadow:0_2px_10px_rgba(0,0,0,0.9)] sm:text-2xl"
            >
              {t("auction.title")}
            </h1>
          </div>

          <div className="hidden items-center gap-3 rounded-xl border border-ui-gold/15 bg-black/30 px-3 py-2 sm:flex">
            <SpriteIcon spriteId={GOLD_COIN_SPRITE} scale={0.85} />
            <span>
              <span className="block text-[9px] tracking-[0.14em] text-ui-muted uppercase">
                {t("auction.availableGold")}
              </span>
              <span className="block font-display text-sm tabular-nums text-ui-text-bright">
                {goldBalance.toLocaleString(language)}
              </span>
            </span>
          </div>

          <CloseButton label={t("auction.close")} onClick={onClose} />
        </header>

        <div aria-hidden className="ui-divider" />

        {error && (
          <p
            role="alert"
            aria-live="assertive"
            className="shrink-0 border-l-2 border-red-400/60 bg-red-950/40 px-3 py-2 text-xs leading-5 text-red-200"
          >
            {error}
          </p>
        )}

        <nav
          aria-label={t("auction.viewsLabel")}
          className="grid shrink-0 grid-cols-3 gap-1.5 self-center rounded-lg border border-ui-stone-light/15 bg-black/30 p-1.5"
        >
          {(["offers", "create", "mine"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md border px-5 py-2 font-display text-xs tracking-[0.12em] uppercase outline-none transition-[border-color,background-color,color] focus-visible:ring-2 focus-visible:ring-ui-gold/60 sm:min-w-40 ${
                activeTab === tab
                  ? "border-ui-accent-light/55 bg-ui-accent-deep/75 text-ui-text-bright"
                  : "border-transparent text-ui-muted hover:border-ui-gold/25 hover:text-ui-text"
              }`}
            >
              {t(TAB_LABEL_KEYS[tab])}
            </button>
          ))}
        </nav>

        <div className="ui-scrollbar grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-12 lg:overflow-hidden">
          <AuctionItemBrowser
            items={filteredItems}
            category={category}
            search={search}
            selectedItemId={selectedItem?.id}
            onCategoryChange={setCategory}
            onSearchChange={setSearch}
            onItemSelect={(itemId) => {
              if (!selectionControlled) setInternalSelectedItemId(itemId);
              onSelectItem?.(itemId);
            }}
          />
          <div
            aria-label={t("auction.offersTab")}
            className={
              activeTab === "offers"
                ? "min-h-0 lg:col-span-8"
                : "hidden"
            }
            role="region"
          >
            <AuctionOrderBook
              item={selectedItem}
              offers={offers}
              goldBalance={goldBalance}
              onAcceptOffer={onAcceptOffer}
            />
          </div>
          <div
            aria-label={t("auction.createOfferTab")}
            className={
              activeTab === "create"
                ? "min-h-0 lg:col-span-8"
                : "hidden"
            }
            role="region"
          >
            <AuctionOrderTicket
              key={selectedItem?.id ?? "no-selected-item"}
              item={selectedItem}
              goldBalance={goldBalance}
              onCreateOrder={onCreateOrder}
            />
          </div>
          <div
            aria-label={t("auction.myOffersTab")}
            className={
              activeTab === "mine"
                ? "min-h-0 lg:col-span-8"
                : "hidden"
            }
            role="region"
          >
            <AuctionMyOffers
              ownOffers={ownOffers}
              history={history}
              onCancelOffer={onCancelOffer}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
