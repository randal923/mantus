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
 * on the left, the product catalog on the right, and the coin balance at the
 * bottom of the category rail.
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
  const confirmingProduct = products.find((product) =>
    product.subOffers.some((offer) => offer.id === pendingOfferId),
  );
  const confirmingOffer = confirmingProduct?.subOffers.find(
    (offer) => offer.id === pendingOfferId,
  );
  const confirming = confirmingProduct && confirmingOffer;

  return (
    <Modal
      title={t("store.title")}
      size="full"
      onClose={() => {
        if (confirming) {
          setPendingOfferId(null);
          return;
        }
        onClose();
      }}
    >
      <div
        aria-hidden={confirming ? true : undefined}
        inert={confirming ? true : undefined}
        className="grid h-full min-h-0 gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]"
      >
        <aside className="flex min-h-0 flex-col gap-3 rounded-sm border border-ui-gold/20 bg-black/25 p-2">
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

          <div className="mt-auto shrink-0 border border-cyan-200/25 bg-cyan-950/20 p-3 shadow-inner shadow-black/50">
            <div className="flex items-center gap-3">
              <Image
                src="/assets/ui/mantus-coin.png"
                alt=""
                width={36}
                height={36}
                className="drop-shadow-[0_0_8px_rgba(77,226,223,0.4)]"
              />
              <span className="min-w-0">
                <span className="block text-xs tracking-wider text-ui-muted uppercase">
                  {t("store.yourBalance")}
                </span>
                <span className="block truncate font-display text-lg font-bold tabular-nums text-cyan-100">
                  {balance.toLocaleString(language)}
                </span>
              </span>
            </div>
            <p className="mt-2 border-t border-ui-gold/15 pt-2 text-xs text-ui-muted">
              {t("store.currentPremium", { count: premiumDaysRemaining })}
            </p>
          </div>
        </aside>

        {/*
          `min-h-0` on the grid item is what keeps the pager on screen: a grid
          item defaults to `min-height: auto`, so without it the product list
          grows past the row instead of scrolling inside it.
        */}
        <div className="flex min-h-0 min-w-0 flex-col rounded-sm border border-ui-gold/20 bg-black/20 p-3">
          {session === null ? (
            <div className="flex min-h-0 flex-1 items-center justify-center border border-ui-gold/15 bg-black/20 text-ui-muted">
              {t("store.loading")}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {session.categoryId === null && (
                <p className="mb-3 shrink-0 border border-ui-gold/15 bg-black/25 px-4 py-3 text-sm leading-6 text-ui-muted">
                  {t("store.description")}
                </p>
              )}
              <ul className="ui-scrollbar grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto pr-1 xl:grid-cols-2">
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
                  <li className="border border-ui-gold/15 bg-black/20 p-4 text-sm text-ui-muted xl:col-span-2">
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
        </div>
      </div>

      {confirming && (
        <StorePurchaseConfirm
          product={confirmingProduct}
          offer={confirmingOffer}
          balance={balance}
          busy={session?.pending === true}
          onCancel={() => setPendingOfferId(null)}
          onConfirm={(newName) => {
            onPurchase(confirmingOffer.id, newName);
            setPendingOfferId(null);
          }}
        />
      )}
    </Modal>
  );
}
