"use client";

import Image from "next/image";
import { useState } from "react";
import type { StoreProduct } from "@tibia/protocol";
import type { StoreSessionState } from "../game-window/types/StoreSessionState";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { StoreCategoryList } from "./StoreCategoryList";
import { StoreProductDetail } from "./StoreProductDetail";
import { StoreProductRow } from "./StoreProductRow";
import { StorePurchaseConfirm } from "./StorePurchaseConfirm";

interface StoreModalProps {
  balance: number;
  premiumDaysRemaining: number;
  session: StoreSessionState | null;
  onClose: () => void;
  onOpenCategory: (categoryId: string, page: number) => void;
  onOpenHome: () => void;
  onSelectProduct: (productId: string) => void;
  onPurchase: (offerId: string, newName?: string) => void;
}

/**
 * The Mantus Store, laid out like the official Tibia store: the category tree
 * on the left, the product list in the middle, the selected product's detail
 * on the right, and the coin balance along the bottom.
 *
 * Nothing here decides anything. The catalog, every price, and every
 * "you already own this" comes from the server; this renders it and sends
 * back an offer id.
 */
export function StoreModal({
  balance,
  premiumDaysRemaining,
  session,
  onClose,
  onOpenCategory,
  onOpenHome,
  onSelectProduct,
  onPurchase,
}: StoreModalProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const [pendingOfferId, setPendingOfferId] = useState<string | null>(null);

  const products: ReadonlyArray<StoreProduct> =
    session === null
      ? []
      : session.categoryId === null
        ? session.home
        : session.products;
  const selected =
    products.find((product) => product.id === session?.selectedProductId) ??
    products[0] ??
    null;
  const confirming = selected?.subOffers.find(
    (offer) => offer.id === pendingOfferId,
  );

  return (
    <Modal title={t("store.title")} size="extra-wide" onClose={onClose}>
      <div className="grid h-[34rem] max-h-[calc(100vh-12rem)] gap-3 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <StoreCategoryList
          categories={session?.categories ?? []}
          selectedId={session?.categoryId ?? null}
          onHome={() => {
            setPendingOfferId(null);
            onOpenHome();
          }}
          onSelect={(categoryId) => {
            setPendingOfferId(null);
            onOpenCategory(categoryId, 0);
          }}
        />

        {/*
          `min-h-0` on the grid item is what keeps the pager and the coin bar
          on screen: a grid item defaults to `min-height: auto`, so without it
          the product list grows past the row instead of scrolling inside it.
        */}
        <div className="flex min-h-0 min-w-0 flex-col">
          {session === null ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-ui-gold/15 bg-black/20 text-ui-muted">
              {t("store.loading")}
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="flex min-h-0 flex-col">
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {products.map((product) => (
                    <StoreProductRow
                      key={product.id}
                      product={product}
                      selected={product.id === selected?.id}
                      balance={balance}
                      busy={session.pending}
                      onSelect={() => {
                        setPendingOfferId(null);
                        onSelectProduct(product.id);
                      }}
                      onBuy={setPendingOfferId}
                    />
                  ))}
                  {products.length === 0 && (
                    <li className="rounded-xl border border-ui-gold/15 bg-black/20 p-4 text-sm text-ui-muted">
                      {t("store.empty")}
                    </li>
                  )}
                </ul>

                {session.categoryId !== null && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      disabled={session.page === 0}
                      onClick={() =>
                        onOpenCategory(session.categoryId!, session.page - 1)
                      }
                    >
                      {t("store.previousPage")}
                    </Button>
                    <span className="text-xs text-ui-muted tabular-nums">
                      {t("store.page", {
                        page: session.page + 1,
                        pageCount: session.pageCount,
                      })}
                    </span>
                    <Button
                      size="sm"
                      disabled={session.page >= session.pageCount - 1}
                      onClick={() =>
                        onOpenCategory(session.categoryId!, session.page + 1)
                      }
                    >
                      {t("store.nextPage")}
                    </Button>
                  </div>
                )}
              </div>

              {selected && (
                <StoreProductDetail
                  product={selected}
                  description={session.description}
                />
              )}
            </div>
          )}

          {selected && confirming && (
            <StorePurchaseConfirm
              product={selected}
              offer={confirming}
              balance={balance}
              busy={session?.pending === true}
              onCancel={() => setPendingOfferId(null)}
              onConfirm={(newName) => {
                onPurchase(confirming.id, newName);
                setPendingOfferId(null);
              }}
            />
          )}

          {session?.purchasedOfferId && (
            <p
              role="status"
              className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-950/25 px-4 py-2.5 text-sm text-emerald-200"
            >
              {t("store.purchaseComplete")}
            </p>
          )}
          {session?.error && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-400/25 bg-red-950/25 px-4 py-2.5 text-sm text-red-200"
            >
              {t(`store.errors.${session.error}`, {
                defaultValue: t("store.errors.failed"),
              })}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-cyan-300/20 bg-cyan-950/15 px-3 py-2">
            <Image
              src="/assets/ui/mantus-coin.png"
              alt=""
              width={28}
              height={28}
              className="drop-shadow-[0_0_8px_rgba(77,226,223,0.4)]"
            />
            <span>
              <span className="block text-[10px] tracking-wider text-ui-muted uppercase">
                {t("store.yourBalance")}
              </span>
              <span className="font-display text-base font-bold tabular-nums text-cyan-100">
                {balance.toLocaleString(language)}
              </span>
            </span>
            <span className="ml-auto rounded-lg border border-ui-gold/20 bg-black/25 px-3 py-1.5 text-xs text-ui-muted">
              {t("store.currentPremium", { count: premiumDaysRemaining })}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
