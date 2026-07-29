"use client";

import Image from "next/image";
import { useId, useState } from "react";
import type { StoreProduct, StoreSubOffer } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";

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

  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-cyan-300/25 bg-cyan-950/15 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (needsName && !nameReady) return;
        onConfirm(needsName ? newName.trim() : undefined);
      }}
    >
      <Image src="/assets/ui/mantus-coin.png" alt="" width={36} height={36} />
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm text-ui-text-bright">
          {product.name}
          {offer.count === undefined
            ? ""
            : ` — ${offer.count.toLocaleString(language)}x`}
        </p>
        <p className="text-xs text-ui-muted">
          {t("store.confirmDescription", {
            price: offer.price.toLocaleString(language),
          })}
        </p>
      </div>

      {needsName && (
        <span className="flex min-w-56 flex-col gap-1">
          <label htmlFor={nameFieldId} className="text-xs text-ui-muted">
            {t("store.newName")}
          </label>
          <input
            id={nameFieldId}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={29}
            autoComplete="off"
            className="h-9 rounded-lg border border-ui-gold/25 bg-black/40 px-2.5 text-sm text-ui-text-bright outline-none focus-visible:border-cyan-200/60"
          />
        </span>
      )}

      <Button size="sm" type="button" onClick={onCancel} disabled={busy}>
        {t("common.cancel")}
      </Button>
      <Button
        variant="primary"
        type="submit"
        disabled={
          busy ||
          offer.disabled === true ||
          balance < offer.price ||
          (needsName && !nameReady)
        }
      >
        {busy ? t("store.purchasing") : t("store.confirm")}
      </Button>
    </form>
  );
}
