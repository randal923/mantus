"use client";

import Image from "next/image";
import { useId, useState } from "react";
import type { StoreProduct, StoreSubOffer } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { CloseButton } from "../ui/CloseButton";
import { StoreProductIcon } from "./StoreProductIcon";

interface StorePurchaseConfirmProps {
  product: StoreProduct;
  offer: StoreSubOffer;
  balance: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (newName?: string) => void;
}

/**
 * The store's confirmation strip. A name-change product asks for the new name
 * here, the way the official client opens its name dialog before charging.
 *
 * The name is only ever a request: the server normalises it, applies the same
 * reserved-word rules character creation uses, and enforces uniqueness inside
 * the purchase transaction.
 */
export function StorePurchaseConfirm({
  product,
  offer,
  balance,
  busy,
  onCancel,
  onConfirm,
}: StorePurchaseConfirmProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const nameFieldId = useId();
  const [newName, setNewName] = useState("");
  const needsName = product.kind === "name-change";
  const nameReady = newName.trim().length >= 3;
  const balanceAfter = balance - offer.price;
  const titleId = `${nameFieldId}-title`;
  const descriptionId = `${nameFieldId}-description`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-2 backdrop-blur-sm sm:p-6"
      onClick={onCancel}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
        className="ui-panel-frame relative flex max-h-full min-h-96 w-full max-w-3xl flex-col overflow-y-auto p-5 font-tibia text-ui-text sm:min-h-[34rem] sm:p-8"
      >
        <header className="flex items-start gap-4">
          <h2
            id={titleId}
            className="min-w-0 flex-1 font-display text-xl font-bold tracking-wide text-ui-text-bright uppercase sm:text-2xl"
          >
            {t("store.confirmTitle")}
          </h2>
          <CloseButton
            label={t("modal.close")}
            onClick={onCancel}
            disabled={busy}
            className="size-11 rounded-full border-ui-gold/60 bg-ui-panel-deep/95 text-ui-gold"
          />
        </header>

        <form
          className="flex min-h-0 flex-1 flex-col items-center pt-8 text-center"
          onSubmit={(event) => {
            event.preventDefault();
            if (needsName && !nameReady) return;
            onConfirm(needsName ? newName.trim() : undefined);
          }}
        >
          <StoreProductIcon icon={product.icon} size={96} />
          <h3 className="mt-5 font-display text-xl font-bold text-ui-text-bright sm:text-2xl">
            {product.name}
            {offer.count === undefined
              ? ""
              : ` — ${offer.count.toLocaleString(language)}x`}
          </h3>
          <p id={descriptionId} className="mt-5 max-w-xl text-base text-ui-muted">
            {t("store.confirmDescription", {
              price: offer.price.toLocaleString(language),
            })}
          </p>

          {needsName && (
            <span className="mt-6 flex w-full max-w-sm flex-col gap-1 text-left">
              <label htmlFor={nameFieldId} className="text-xs text-ui-muted">
                {t("store.newName")}
              </label>
              <input
                id={nameFieldId}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                maxLength={29}
                autoComplete="off"
                autoFocus
                className="h-10 border border-ui-gold/25 bg-black/40 px-3 text-sm text-ui-text-bright outline-none focus-visible:border-ui-gold/60"
              />
            </span>
          )}

          <div className="mt-auto grid w-full gap-4 pt-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <div className="flex h-12 items-center justify-center gap-3 rounded-full border border-ui-gold/60 bg-black/55 px-5 shadow-inner shadow-black/60">
                <Image
                  src="/assets/ui/mantus-coin.png"
                  alt=""
                  width={28}
                  height={28}
                />
                <span className="font-display text-xl font-bold tabular-nums text-cyan-100">
                  {offer.price.toLocaleString(language)}
                </span>
              </div>
              <p
                className={`mt-2 text-sm tabular-nums ${balanceAfter < 0 ? "text-red-400" : "text-ui-muted"}`}
              >
                {t("store.balanceAfter", {
                  balance: balanceAfter.toLocaleString(language),
                })}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                type="submit"
                autoFocus={!needsName}
                className="h-12 w-full text-base"
                disabled={
                  busy ||
                  offer.disabled === true ||
                  balance < offer.price ||
                  (needsName && !nameReady)
                }
              >
                {busy ? t("store.purchasing") : t("store.confirm")}
              </Button>
              <Button type="button" onClick={onCancel} disabled={busy}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
